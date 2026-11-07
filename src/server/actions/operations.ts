'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  announcements,
  attendance,
  eventMembers,
  events,
  gates,
  issues,
  teamMembers,
  timelineItems,
  workingPoints,
} from '@/db/schema';
import { format } from '@/lib/i18n';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { nowHHmm } from '@/lib/time';
import {
  announcementSchema,
  attendanceSchema,
  attendanceTimesSchema,
  creditSchema,
  eventCreditSchema,
  firstIssueKey,
  issueSchema,
  issueStatusSchema,
  str,
  timelineSchema,
} from '@/lib/validation';
import type { AttendanceStatus, IssueStatus, Priority } from '@/lib/constants';
import { assertEventManager, assertRole, currentUser, resolveEventScope } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';
import { announcementAudience, pushToMembers } from '@/server/services/push';
import { routeNewIssue } from '@/server/services/issue-routing';

import { fail, idle, ok, type ActionState } from './types';

function revalidateEvent(eventId: string, ...sections: string[]) {
  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${eventId}`);
    for (const section of sections) {
      revalidatePath(`${base}/events/${eventId}/${section}`);
    }
  }
}

function errorFor(t: Awaited<ReturnType<typeof getT>>['t'], key: string) {
  const errors = t.errors as unknown as Record<string, string>;
  return errors[key] ?? t.errors.generic;
}

/* ------------------------------ attendance ------------------------------- */

/**
 * Manual attendance (spec §16). Check-in is stamped the first time someone is
 * marked present or late; correcting a status later never invents a new time.
 */
export async function recordAttendanceAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');

  // Gate leaders may record attendance for their own gate's members.
  const user = await currentUser();
  if (!user) return fail(t.errors.forbidden);
  const scope = await resolveEventScope(eventId, user);
  if (!scope) return fail(t.errors.forbidden);

  const parsed = attendanceSchema.safeParse({
    eventMemberId: str(form, 'eventMemberId') ?? '',
    status: str(form, 'status') ?? '',
    notes: str(form, 'notes'),
  });
  if (!parsed.success) return fail(errorFor(t, firstIssueKey(parsed.error)));

  const member = await db
    .select({
      id: eventMembers.id,
      eventId: eventMembers.eventId,
      name: teamMembers.fullName,
    })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(eventMembers.id, parsed.data.eventMemberId))
    .get();
  if (!member || member.eventId !== eventId) return fail(t.errors.notFound);

  const existing = await db.query.attendance.findFirst({
    where: eq(attendance.eventMemberId, parsed.data.eventMemberId),
  });

  /*
   * Marking someone present fills in the current clock as a convenience, and
   * only when nothing is there yet — it is a suggestion, not a fact the system
   * insists on. It stays editable and clearable afterwards through
   * setAttendanceTimesAction, because the supervisor is usually writing down
   * an arrival that happened twenty minutes ago.
   */
  const marksArrival =
    parsed.data.status === 'PRESENT' || parsed.data.status === 'LATE';
  const checkInTime = marksArrival ? (existing?.checkInTime ?? nowHHmm()) : null;

  if (existing) {
    await db
      .update(attendance)
      .set({
        status: parsed.data.status,
        checkInTime,
        // Someone moved to absent has no departure either.
        checkOutTime: marksArrival ? existing.checkOutTime : null,
        notes: parsed.data.notes ?? null,
        recordedById: user.id,
        updatedAt: new Date(),
      })
      .where(eq(attendance.id, existing.id));
  } else {
    await db.insert(attendance).values({
      id: newId(),
      eventId,
      eventMemberId: parsed.data.eventMemberId,
      status: parsed.data.status,
      checkInTime,
      checkOutTime: null,
      recordedById: user.id,
      notes: parsed.data.notes ?? null,
    });
  }

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'ATTENDANCE',
    entity: 'ATTENDANCE',
    entityId: parsed.data.eventMemberId,
    entityLabel: member.name,
    oldValues: existing ? { status: existing.status } : null,
    newValues: { status: parsed.data.status },
    summary: `${member.name}: ${t.enums.attendanceStatus[parsed.data.status as AttendanceStatus]}`,
  });

  revalidateEvent(eventId, 'attendance', 'reports');
  return ok();
}

export async function checkOutAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await currentUser();
  if (!user) return fail(t.errors.forbidden);
  const scope = await resolveEventScope(eventId, user);
  if (!scope) return fail(t.errors.forbidden);

  const id = str(form, 'eventMemberId');
  if (!id) return fail(t.errors.notFound);

  await db
    .update(attendance)
    .set({ checkOutTime: nowHHmm(), recordedById: user.id, updatedAt: new Date() })
    .where(and(eq(attendance.eventMemberId, id), eq(attendance.eventId, eventId)));

  revalidateEvent(eventId, 'attendance');
  return ok();
}

/**
 * Correcting the clock after the fact.
 *
 * Reserved for whoever manages the event rather than every gate leader: a gate
 * leader marks who turned up at their own gate, but rewriting the times that
 * end up on a payroll sheet is the supervisor's to do, and every change is
 * written to the audit log with the old value beside the new one.
 */
export async function setAttendanceTimesAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventManager(eventId);
  if (!user) return fail(t.errors.forbidden);

  const parsed = attendanceTimesSchema.safeParse({
    eventMemberId: str(form, 'eventMemberId') ?? '',
    checkInTime: String(form.get('checkInTime') ?? ''),
    checkOutTime: String(form.get('checkOutTime') ?? ''),
  });
  if (!parsed.success) return fail(errorFor(t, firstIssueKey(parsed.error)));

  const member = await db
    .select({
      id: eventMembers.id,
      eventId: eventMembers.eventId,
      name: teamMembers.fullName,
    })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(eventMembers.id, parsed.data.eventMemberId))
    .get();
  if (!member || member.eventId !== eventId) return fail(t.errors.notFound);

  const existing = await db.query.attendance.findFirst({
    where: eq(attendance.eventMemberId, parsed.data.eventMemberId),
  });

  if (existing) {
    await db
      .update(attendance)
      .set({
        checkInTime: parsed.data.checkInTime,
        checkOutTime: parsed.data.checkOutTime,
        recordedById: user.id,
        updatedAt: new Date(),
      })
      .where(eq(attendance.id, existing.id));
  } else {
    // A time entered before any status still has to land somewhere.
    await db.insert(attendance).values({
      id: newId(),
      eventId,
      eventMemberId: parsed.data.eventMemberId,
      status: 'PENDING',
      checkInTime: parsed.data.checkInTime,
      checkOutTime: parsed.data.checkOutTime,
      recordedById: user.id,
      notes: null,
    });
  }

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'ATTENDANCE',
    entity: 'ATTENDANCE',
    entityId: parsed.data.eventMemberId,
    entityLabel: member.name,
    oldValues: existing
      ? { checkInTime: existing.checkInTime, checkOutTime: existing.checkOutTime }
      : null,
    newValues: {
      checkInTime: parsed.data.checkInTime,
      checkOutTime: parsed.data.checkOutTime,
    },
    summary: `${member.name}: ${parsed.data.checkInTime ?? '—'} → ${
      parsed.data.checkOutTime ?? '—'
    }`,
  });

  revalidateEvent(eventId, 'attendance', 'reports');
  return ok();
}

/**
 * Days credited to one person for this event.
 *
 * An empty box means "the ordinary case" and puts the person back on the
 * event's own default, so this records a decision rather than a copy of a
 * number that may later change.
 */
export async function setMemberCreditAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertRole('ADMIN').catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const parsed = creditSchema.safeParse({
    eventMemberId: str(form, 'eventMemberId') ?? '',
    payAmount: String(form.get('payAmount') ?? ''),
    creditNote: str(form, 'creditNote'),
  });
  if (!parsed.success) return fail(errorFor(t, firstIssueKey(parsed.error)));

  const member = await db
    .select({
      id: eventMembers.id,
      eventId: eventMembers.eventId,
      payAmount: eventMembers.payAmount,
      name: teamMembers.fullName,
    })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(eventMembers.id, parsed.data.eventMemberId))
    .get();
  if (!member || member.eventId !== eventId) return fail(t.errors.notFound);

  await db
    .update(eventMembers)
    .set({
      payAmount: parsed.data.payAmount,
      creditNote: parsed.data.creditNote ?? null,
      updatedAt: new Date(),
    })
    .where(eq(eventMembers.id, parsed.data.eventMemberId));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'EVENT_MEMBER',
    entityId: parsed.data.eventMemberId,
    entityLabel: member.name,
    oldValues: { payAmount: member.payAmount },
    newValues: { payAmount: parsed.data.payAmount, creditNote: parsed.data.creditNote },
    reason: parsed.data.creditNote ?? null,
    summary: `${member.name}: ${parsed.data.payAmount ?? t.credit.eventDefault}`,
  });

  revalidateEvent(eventId, 'attendance', 'reports', 'team');
  revalidatePath('/admin/credits');
  revalidatePath('/admin/team');
  return ok();
}

/** The baseline every member of this event starts from. */
export async function setEventCreditDefaultAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertRole('ADMIN').catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const parsed = eventCreditSchema.safeParse({
    payDefault: String(form.get('payDefault') ?? ''),
  });
  if (!parsed.success) return fail(errorFor(t, firstIssueKey(parsed.error)));

  await db
    .update(events)
    .set({ payDefault: parsed.data.payDefault, updatedAt: new Date() })
    .where(eq(events.id, eventId));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'EVENT',
    entityId: eventId,
    entityLabel: null,
    oldValues: null,
    newValues: { payDefault: parsed.data.payDefault },
    summary: `${t.credit.eventDefault}: ${parsed.data.payDefault}`,
  });

  revalidateEvent(eventId, 'attendance', 'reports');
  revalidatePath('/admin/credits');
  return ok();
}

/* ----------------------------- announcements ----------------------------- */

export async function createAnnouncementAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  let user;
  try {
    user = await assertEventManager(eventId);
  } catch {
    return fail(t.errors.forbidden);
  }

  const parsed = announcementSchema.safeParse({
    title: str(form, 'title') ?? '',
    message: str(form, 'message') ?? '',
    priority: str(form, 'priority') ?? 'NORMAL',
    audience: str(form, 'audience') ?? 'EVENT',
    gateId: str(form, 'gateId'),
    workingPointId: str(form, 'workingPointId'),
    eventMemberId: str(form, 'eventMemberId'),
    expiresAt: str(form, 'expiresAt'),
  });
  if (!parsed.success) return fail(errorFor(t, firstIssueKey(parsed.error)));

  const data = parsed.data;
  if (data.audience === 'GATE' && !data.gateId) return fail(t.errors.required);
  if (data.audience === 'WORKING_POINT' && !data.workingPointId) {
    return fail(t.errors.required);
  }
  if (data.audience === 'MEMBER' && !data.eventMemberId) return fail(t.errors.required);

  const expires = data.expiresAt ? new Date(data.expiresAt) : null;
  if (expires && Number.isNaN(expires.getTime())) return fail(t.errors.invalidDate);

  const id = newId();
  await db.insert(announcements).values({
    id,
    eventId,
    title: data.title,
    message: data.message,
    priority: data.priority,
    audience: data.audience,
    gateId: data.audience === 'GATE' ? data.gateId! : null,
    workingPointId: data.audience === 'WORKING_POINT' ? data.workingPointId! : null,
    eventMemberId: data.audience === 'MEMBER' ? data.eventMemberId! : null,
    createdById: user.id,
    createdByName: user.name,
    expiresAt: expires,
  });

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'ANNOUNCE',
    entity: 'ANNOUNCEMENT',
    entityId: id,
    entityLabel: data.title,
    newValues: { priority: t.enums.priority[data.priority as Priority] },
    summary: `${t.enums.priority[data.priority as Priority]}: ${data.title}`,
  });

  /*
   * And on the phones of whoever it was addressed to — the same audience the
   * announcement itself has, not everybody. A gate-three message reaching a
   * hundred and twenty people is how the next one gets ignored.
   *
   * After the record, never before it, and never able to fail it: a message
   * that is written down and not delivered is recoverable; one that was never
   * written down is not.
   */
  try {
    const audience = await announcementAudience({
      eventId,
      audience: data.audience,
      gateId: data.gateId,
      workingPointId: data.workingPointId,
      eventMemberId: data.eventMemberId,
    });
    const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
    await pushToMembers(audience, {
      title: format(t.push.announceTitle, { event: event?.name ?? '' }),
      body: data.title,
      url: '/me',
      tag: `ann:${id}`,
    });
  } catch {
    /* Delivery is best effort; the announcement is already recorded. */
  }

  revalidateEvent(eventId, 'announcements');
  return ok(t.announcement.sent);
}

export async function deleteAnnouncementAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  let user;
  try {
    user = await assertEventManager(eventId);
  } catch {
    return fail(t.errors.forbidden);
  }
  const id = str(form, 'announcementId');
  if (!id) return fail(t.errors.notFound);

  const row = await db.query.announcements.findFirst({
    where: eq(announcements.id, id),
  });
  if (!row || row.eventId !== eventId) return fail(t.errors.notFound);

  await db.delete(announcements).where(eq(announcements.id, id));
  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'DELETE',
    entity: 'ANNOUNCEMENT',
    entityId: id,
    entityLabel: row.title,
    summary: `${t.enums.auditAction.DELETE}: ${row.title}`,
  });

  revalidateEvent(eventId, 'announcements');
  return ok();
}

/* --------------------------------- issues -------------------------------- */

export async function createIssueAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await currentUser();
  if (!user) return fail(t.errors.forbidden);
  const scope = await resolveEventScope(eventId, user);
  if (!scope) return fail(t.errors.forbidden);

  const parsed = issueSchema.safeParse({
    type: str(form, 'type') ?? 'OTHER',
    description: str(form, 'description') ?? '',
    priority: str(form, 'priority') ?? 'MEDIUM',
    gateId: str(form, 'gateId'),
    workingPointId: str(form, 'workingPointId'),
  });
  if (!parsed.success) return fail(errorFor(t, firstIssueKey(parsed.error)));

  const id = newId();
  const routed = await routeNewIssue({
    eventId,
    gateId: parsed.data.gateId ?? null,
    priority: parsed.data.priority,
  });

  await db.insert(issues).values({
    id,
    eventId,
    type: parsed.data.type,
    description: parsed.data.description,
    priority: parsed.data.priority,
    status: 'OPEN',
    assigneeUserId: routed.assigneeUserId,
    assignedAt: routed.assignedAt,
    dueAt: routed.dueAt,
    gateId: parsed.data.gateId ?? null,
    workingPointId: parsed.data.workingPointId ?? null,
    reportedByMemberId: null,
    reportedByUserId: user.id,
    reporterName: user.name,
  });

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'ISSUE',
    entity: 'ISSUE',
    entityId: id,
    entityLabel: t.enums.issueType[parsed.data.type],
    newValues: { priority: parsed.data.priority, status: 'OPEN' },
    summary: `${t.issue.newIssue}: ${t.enums.issueType[parsed.data.type]}`,
  });

  revalidateEvent(eventId, 'issues');
  return ok(t.issue.submitted);
}

export async function updateIssueStatusAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await currentUser();
  if (!user) return fail(t.errors.forbidden);
  const scope = await resolveEventScope(eventId, user);
  if (!scope) return fail(t.errors.forbidden);

  const id = str(form, 'issueId');
  if (!id) return fail(t.errors.notFound);

  const parsed = issueStatusSchema.safeParse({
    status: str(form, 'status') ?? '',
    resolutionNote: str(form, 'resolutionNote'),
  });
  if (!parsed.success) return fail(errorFor(t, firstIssueKey(parsed.error)));

  const row = await db.query.issues.findFirst({ where: eq(issues.id, id) });
  if (!row || row.eventId !== eventId) return fail(t.errors.notFound);

  const next = parsed.data.status;
  const now = new Date();

  await db
    .update(issues)
    .set({
      status: next,
      /*
       * Touching a report takes it. Whoever moves it off OPEN is the person
       * who has it from then on, unless somebody already does — which is how
       * an unassigned report at a gate with no leader of its own finds an
       * owner the moment a human looks at it, without anybody having to
       * remember to claim it.
       */
      assigneeUserId: row.assigneeUserId ?? user.id,
      assignedAt: row.assignedAt ?? now,
      acknowledgedAt:
        row.acknowledgedAt ??
        (['ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(next) ? now : null),
      resolvedAt:
        next === 'RESOLVED' || next === 'CLOSED' ? (row.resolvedAt ?? now) : null,
      resolvedById:
        next === 'RESOLVED' || next === 'CLOSED' ? (row.resolvedById ?? user.id) : null,
      resolutionNote: parsed.data.resolutionNote ?? row.resolutionNote,
      updatedAt: now,
    })
    .where(eq(issues.id, id));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'ISSUE',
    entity: 'ISSUE',
    entityId: id,
    entityLabel: t.enums.issueType[row.type as keyof typeof t.enums.issueType],
    oldValues: { status: row.status },
    newValues: { status: next },
    reason: parsed.data.resolutionNote,
    summary: `${t.enums.issueType[row.type as keyof typeof t.enums.issueType]}: ${
      t.enums.issueStatus[row.status as IssueStatus]
    } → ${t.enums.issueStatus[next]}`,
  });

  revalidateEvent(eventId, 'issues');
  return ok();
}

/* -------------------------------- timeline ------------------------------- */

export async function saveTimelineItemAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  let user;
  try {
    user = await assertEventManager(eventId);
  } catch {
    return fail(t.errors.forbidden);
  }

  const id = str(form, 'itemId');
  const parsed = timelineSchema.safeParse({
    title: str(form, 'title') ?? '',
    description: str(form, 'description'),
    scheduledTime: str(form, 'scheduledTime') ?? '',
    status: str(form, 'status') ?? 'UPCOMING',
  });
  if (!parsed.success) return fail(errorFor(t, firstIssueKey(parsed.error)));

  if (id) {
    const existing = await db.query.timelineItems.findFirst({
      where: eq(timelineItems.id, id),
    });
    if (!existing || existing.eventId !== eventId) return fail(t.errors.notFound);
    await db
      .update(timelineItems)
      .set({
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        scheduledTime: parsed.data.scheduledTime,
        status: parsed.data.status,
        updatedAt: new Date(),
      })
      .where(eq(timelineItems.id, id));
  } else {
    const count = await db.$count(timelineItems, eq(timelineItems.eventId, eventId));
    await db.insert(timelineItems).values({
      id: newId(),
      eventId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      scheduledTime: parsed.data.scheduledTime,
      status: parsed.data.status,
      sortOrder: count,
    });
  }

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: id ? 'UPDATE' : 'CREATE',
    entity: 'TIMELINE',
    entityId: id,
    entityLabel: parsed.data.title,
    newValues: { time: parsed.data.scheduledTime, status: parsed.data.status },
    summary: `${t.timeline.title}: ${parsed.data.title}`,
  });

  revalidateEvent(eventId, 'timeline');
  return ok();
}

export async function deleteTimelineItemAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  try {
    await assertEventManager(eventId);
  } catch {
    return fail(t.errors.forbidden);
  }
  const id = str(form, 'itemId');
  if (!id) return fail(t.errors.notFound);
  await db
    .delete(timelineItems)
    .where(and(eq(timelineItems.id, id), eq(timelineItems.eventId, eventId)));
  revalidateEvent(eventId, 'timeline');
  return ok();
}

/* ------------------------------ lookup helpers ---------------------------- */

export async function listEventLocations(eventId: string) {
  const [gateRows, wpRows] = await Promise.all([
    db
      .select({ id: gates.id, name: gates.name })
      .from(gates)
      .where(eq(gates.eventId, eventId)),
    db
      .select({ id: workingPoints.id, name: workingPoints.name })
      .from(workingPoints)
      .where(eq(workingPoints.eventId, eventId)),
  ]);
  return { gates: gateRows, workingPoints: wpRows };
}

/**
 * The same attendance mark for everyone selected.
 *
 * At the end of a night a supervisor is not deciding twenty-six times; they
 * are deciding once — "everyone at gate 3 was here" — and then clicking
 * twenty-six times to say so. This is that one decision.
 *
 * A loop over the single-person action rather than a faster path into the
 * table: the per-person audit line is what makes attendance defensible later,
 * and a batch that skips it would be a batch nobody could check. It stops at
 * the first refusal and says how far it got.
 */
export async function recordAttendanceManyAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const status = str(form, 'status') ?? '';

  const ids = [
    ...new Set(
      form
        .getAll('eventMemberIds')
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ].slice(0, 300);
  if (ids.length === 0) return fail(t.errors.notFound);

  let done = 0;
  for (const id of ids) {
    const body = new FormData();
    body.set('eventId', eventId);
    body.set('eventMemberId', id);
    body.set('status', status);
    const result = await recordAttendanceAction(idle, body);
    if (result.status === 'error' || result.status === 'conflict') {
      return done === 0 ? result : fail(`${result.message} (${done}/${ids.length})`);
    }
    done += 1;
  }
  return ok();
}
