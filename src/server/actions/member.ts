'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, ne } from 'drizzle-orm';

import { db } from '@/db';
import {
  assignments,
  attendance,
  eventMembers,
  events,
  feedbackResponses,
  gates,
  issues,
  workingPoints,
} from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { feedbackSchema, firstIssueKey, issueSchema, readFeedback, str } from '@/lib/validation';
import { recordAudit } from '@/server/services/audit';
import { resolveMemberByToken } from '@/server/services/member';
import { routeNewIssue } from '@/server/services/issue-routing';
import { dueAtFor } from '@/lib/issue-sla';
import { FEEDBACK_MIN_GROUP, type IssuePriority } from '@/lib/constants';

import { fail, ok, type ActionState } from './types';

/**
 * A member reports an issue using only their token. The gate is taken from
 * their own assignment, never from the form, so a member cannot file a report
 * against a gate they do not work (spec §30 / §53).
 */
export async function memberReportIssueAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const token = String(form.get('token') ?? '');

  const member = await resolveMemberByToken(token);
  if (!member) return fail(t.member.invalidToken);
  if (member.status === 'CANCELLED') return fail(t.member.cancelled);
  if (member.tokenExpiresAt && member.tokenExpiresAt.getTime() < Date.now()) {
    return fail(t.member.expiredToken);
  }

  const parsed = issueSchema.safeParse({
    type: str(form, 'type') ?? 'OTHER',
    description: str(form, 'description') ?? '',
    priority: str(form, 'priority') ?? 'MEDIUM',
    gateId: null,
    workingPointId: null,
  });
  if (!parsed.success) {
    const errors = t.errors as unknown as Record<string, string>;
    return fail(errors[firstIssueKey(parsed.error)] ?? t.errors.generic);
  }

  const assignment = await db
    .select({
      gateId: assignments.gateId,
      workingPointId: assignments.workingPointId,
    })
    .from(assignments)
    .where(
      and(
        eq(assignments.eventMemberId, member.id),
        eq(assignments.eventId, member.eventId),
      ),
    )
    .get();

  /*
   * The same report, sent twice.
   *
   * A phone with no signal writes the report to itself and sends it when the
   * network returns; the promoter, seeing nothing happen, taps again. Both
   * carry the id the device minted, so the second arrival is recognised as the
   * first and answered with success — the report is in, which is what the
   * person asked about, and the board stays clean.
   *
   * A report sent with no client id at all (an older page, a browser with no
   * storage) is simply created, as before.
   */
  const clientId = str(form, 'clientId');
  if (clientId) {
    const already = await db.query.issues.findFirst({
      where: eq(issues.clientId, clientId),
    });
    if (already) {
      return already.eventId === member.eventId && already.reportedByMemberId === member.id
        ? ok(t.member.issueSent)
        : fail(t.errors.forbidden);
    }
  }

  const routed = await routeNewIssue({
    eventId: member.eventId,
    gateId: assignment?.gateId ?? null,
    priority: parsed.data.priority,
  });

  const id = newId();
  await db.insert(issues).values({
    id,
    eventId: member.eventId,
    type: parsed.data.type,
    description: parsed.data.description,
    priority: parsed.data.priority,
    status: 'OPEN',
    gateId: assignment?.gateId ?? null,
    workingPointId: assignment?.workingPointId ?? null,
    reportedByMemberId: member.id,
    reportedByUserId: null,
    reporterName: member.name,
    clientId: clientId ?? null,
    assigneeUserId: routed.assigneeUserId,
    assignedAt: routed.assignedAt,
    dueAt: routed.dueAt,
  });

  let locationName: string | null = null;
  if (assignment?.gateId) {
    locationName =
      (await db.query.gates.findFirst({ where: eq(gates.id, assignment.gateId) }))?.name ??
      null;
  } else if (assignment?.workingPointId) {
    locationName =
      (
        await db.query.workingPoints.findFirst({
          where: eq(workingPoints.id, assignment.workingPointId),
        })
      )?.name ?? null;
  }

  await recordAudit({
    eventId: member.eventId,
    actorId: null,
    actorName: member.name,
    action: 'ISSUE',
    entity: 'ISSUE',
    entityId: id,
    entityLabel: t.enums.issueType[parsed.data.type],
    newValues: { priority: parsed.data.priority, location: locationName },
    summary: `${member.name} — ${t.enums.issueType[parsed.data.type]}${
      locationName ? ` (${locationName})` : ''
    }`,
  });

  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${member.eventId}/issues`);
    revalidatePath(`${base}/events/${member.eventId}`);
  }
  revalidatePath(`/member/${token}`);

  return ok(t.issue.submitted);
}

/**
 * A member's verdict on the event they just worked.
 *
 * Written with their own token and nothing else, and re-writable by them for
 * as long as they want to change their mind: this is an opinion, not a record
 * of fact, and an opinion someone cannot correct is one they stop giving. A
 * supervisor can read it and can never write it.
 *
 * It is refused before the event is marked finished — an evening that has not
 * happened yet cannot be reviewed, and a half-written verdict at the busiest
 * moment of the night is worse than none.
 */
export async function submitFeedbackAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const token = String(form.get('token') ?? '');

  const member = await resolveMemberByToken(token);
  if (!member) return fail(t.member.invalidToken);
  if (member.status === 'CANCELLED') return fail(t.member.cancelled);
  if (member.tokenExpiresAt && member.tokenExpiresAt.getTime() < Date.now()) {
    return fail(t.member.expiredToken);
  }

  const event = await db.query.events.findFirst({ where: eq(events.id, member.eventId) });
  if (!event) return fail(t.errors.notFound);
  if (event.status !== 'COMPLETED' && event.status !== 'ARCHIVED') {
    return fail(t.feedback.notYet);
  }

  /*
   * Once, and once only. A second answer cannot replace the first, because
   * replacing it would mean knowing which row was theirs — and nothing here
   * knows that. The form says so before the last button, so this is a guard,
   * not a surprise.
   */
  const row = await db
    .select({ feedbackAt: eventMembers.feedbackAt })
    .from(eventMembers)
    .where(eq(eventMembers.id, member.id))
    .get();
  if (row?.feedbackAt) return fail(t.feedback.alreadySent);

  const parsed = feedbackSchema.safeParse(readFeedback(form));
  if (!parsed.success) {
    return fail(t.errors[firstIssueKey(parsed.error) as keyof typeof t.errors] ?? t.errors.generic);
  }
  const answers = parsed.data;

  /*
   * The job goes on the answer only when enough people shared it to hide in.
   * On a gate with six scanners "a scanner said the handhelds kept dropping"
   * is a useful line in a report; on a night with one person on VIP the same
   * sentence is that person's name.
   */
  const mine = await db
    .select({ task: assignments.task })
    .from(assignments)
    .where(
      and(eq(assignments.eventMemberId, member.id), ne(assignments.status, 'CANCELLED')),
    )
    .get();
  let role: string | null = null;
  if (mine) {
    const sharing = await db.$count(
      assignments,
      and(
        eq(assignments.eventId, member.eventId),
        eq(assignments.task, mine.task),
        ne(assignments.status, 'CANCELLED'),
      ),
    );
    if (sharing >= FEEDBACK_MIN_GROUP) role = mine.task;
  }

  await db.insert(feedbackResponses).values({
    id: newId(),
    eventId: member.eventId,
    role,
    ...answers,
    submittedAt: new Date(),
  });

  await db
    .update(eventMembers)
    .set({ feedbackAt: new Date(), updatedAt: new Date() })
    .where(eq(eventMembers.id, member.id));

  /*
   * The audit line records that an answer arrived and from whom, never what it
   * said — and it cannot say what it said, because the two are not connected.
   * Even the timestamps are a day apart in practice, which is as it should be.
   */
  await recordAudit({
    eventId: member.eventId,
    actorId: null,
    actorName: member.name,
    action: 'UPDATE',
    entity: 'EVENT_MEMBER',
    entityId: member.id,
    entityLabel: member.name,
    summary: t.feedback.received,
  });

  revalidatePath(`/member/${token}`);
  revalidatePath(`/admin/events/${member.eventId}/reports`);
  return ok(t.feedback.thanks);
}

/**
 * "It is still happening."
 *
 * The other half of the loop, and the half that decides whether anybody
 * reports anything a second time. Somebody at a desk marked this resolved;
 * the person standing in front of it says otherwise, and they are the one who
 * can see. So their word reopens it, puts it back in front of whoever closed
 * it, and counts — a report reopened twice is a different kind of problem from
 * a report reopened once, and the count is what makes that visible.
 *
 * Only the reporter may do this, only on their own report, and only on one
 * that was actually closed: reopening an open report would just be noise.
 */
export async function memberReopenIssueAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const token = String(form.get('token') ?? '');

  const member = await resolveMemberByToken(token);
  if (!member) return fail(t.member.invalidToken);
  if (member.status === 'CANCELLED') return fail(t.member.cancelled);

  const issueId = str(form, 'issueId');
  if (!issueId) return fail(t.errors.notFound);

  const row = await db.query.issues.findFirst({ where: eq(issues.id, issueId) });
  if (
    !row ||
    row.eventId !== member.eventId ||
    row.reportedByMemberId !== member.id
  ) {
    return fail(t.errors.notFound);
  }
  if (row.status !== 'RESOLVED' && row.status !== 'CLOSED') {
    return fail(t.errors.notFound);
  }

  const now = new Date();
  await db
    .update(issues)
    .set({
      status: 'OPEN',
      // The clock starts again, and it starts short: a problem that was
      // declared fixed and is not is more urgent than it was the first time.
      acknowledgedAt: null,
      resolvedAt: null,
      reopenedAt: now,
      reopenCount: row.reopenCount + 1,
      dueAt: dueAtFor(row.priority as IssuePriority, now),
      updatedAt: now,
    })
    .where(eq(issues.id, issueId));

  await recordAudit({
    eventId: member.eventId,
    actorId: null,
    actorName: member.name,
    action: 'UPDATE',
    entity: 'ISSUE',
    entityId: issueId,
    entityLabel: row.description.slice(0, 60),
    oldValues: { status: row.status },
    newValues: { status: 'OPEN', reopenCount: row.reopenCount + 1 },
    reason: t.member.stillHappening,
    summary: `${t.member.stillHappening}: ${member.name}`,
  });

  revalidatePath(`/member/${token}`);
  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${member.eventId}/issues`);
  }
  return ok(t.member.reopened);
}

/**
 * The panic button.
 *
 * Not a report with the priority turned up: a separate sentence, with its own
 * type, that says a named person at a named post is asking for somebody to
 * come. The gate leader is not always at the gate — he has six of them — and
 * the alternative a promoter actually uses is to walk off his post looking
 * for him, which is how a gate ends up unmanned at the worst moment.
 *
 * It carries his name and his gate because the supervisor's first two
 * questions are who and where, and because an anonymous alarm is one nobody
 * can answer. A line of explanation is offered and never demanded — a man
 * with a crowd pushing at a barrier does not type.
 *
 * It refuses outside the evening. Before he has been confirmed at his post
 * there is nothing to come to, and the button is not on the screen either.
 */
export async function memberPanicAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const token = String(form.get('token') ?? '');

  const member = await resolveMemberByToken(token);
  if (!member) return fail(t.member.invalidToken);
  if (member.status === 'CANCELLED') return fail(t.member.cancelled);
  if (member.tokenExpiresAt && member.tokenExpiresAt.getTime() < Date.now()) {
    return fail(t.member.expiredToken);
  }

  const att = await db
    .select({ approvedAt: attendance.approvedAt, status: attendance.status })
    .from(attendance)
    .where(eq(attendance.eventMemberId, member.id))
    .get();
  const onDuty =
    Boolean(att?.approvedAt) || att?.status === 'PRESENT' || att?.status === 'LATE';
  if (!onDuty) return fail(t.journey.notOnDuty);

  const assignment = await db
    .select({ gateId: assignments.gateId, workingPointId: assignments.workingPointId })
    .from(assignments)
    .where(
      and(
        eq(assignments.eventMemberId, member.id),
        eq(assignments.eventId, member.eventId),
        ne(assignments.status, 'CANCELLED'),
      ),
    )
    .get();

  let locationName: string | null = null;
  if (assignment?.gateId) {
    locationName =
      (await db.query.gates.findFirst({ where: eq(gates.id, assignment.gateId) }))?.name ??
      null;
  } else if (assignment?.workingPointId) {
    locationName =
      (
        await db.query.workingPoints.findFirst({
          where: eq(workingPoints.id, assignment.workingPointId),
        })
      )?.name ?? null;
  }

  /*
   * One open call at a time. Pressing it again while somebody is already on
   * the way adds a second red line to the board and no information.
   */
  const already = await db.query.issues.findFirst({
    where: and(
      eq(issues.eventId, member.eventId),
      eq(issues.reportedByMemberId, member.id),
      eq(issues.type, 'EMERGENCY'),
      ne(issues.status, 'RESOLVED'),
    ),
  });
  if (already) return ok(t.member.panicAlready);

  const note = str(form, 'description');
  const routed = await routeNewIssue({
    eventId: member.eventId,
    gateId: assignment?.gateId ?? null,
    priority: 'CRITICAL',
  });

  const id = newId();
  await db.insert(issues).values({
    id,
    eventId: member.eventId,
    type: 'EMERGENCY',
    description:
      note ??
      `${t.member.panicTitle} — ${member.name}${locationName ? ` · ${locationName}` : ''}`,
    priority: 'CRITICAL',
    status: 'OPEN',
    gateId: assignment?.gateId ?? null,
    workingPointId: assignment?.workingPointId ?? null,
    reportedByMemberId: member.id,
    reportedByUserId: null,
    reporterName: member.name,
    clientId: null,
    assigneeUserId: routed.assigneeUserId,
    assignedAt: routed.assignedAt,
    dueAt: routed.dueAt,
  });

  await recordAudit({
    eventId: member.eventId,
    actorId: null,
    actorName: member.name,
    action: 'ISSUE',
    entity: 'ISSUE',
    entityId: id,
    entityLabel: t.enums.issueType.EMERGENCY,
    newValues: { location: locationName },
    summary: `${t.member.panicTitle}: ${member.name}${
      locationName ? ` (${locationName})` : ''
    }`,
  });

  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${member.eventId}/issues`);
    revalidatePath(`${base}/events/${member.eventId}`);
  }
  revalidatePath(`/member/${token}`);

  return ok(t.member.panicSent);
}
