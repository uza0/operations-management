'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { and, eq, inArray, isNotNull, ne, or } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventMembers,
  events,
  seatSetupDetails,
  seatSetupMembers,
  teamMembers,
} from '@/db/schema';
import { format } from '@/lib/i18n';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { SEAT_SETUP_PAY, MAX_EVENT_PAY } from '@/lib/money';
import { formatDate, formatTime } from '@/lib/time';
import { str } from '@/lib/validation';
import { assertEventManager } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';
import { pushConfigured, pushOnce } from '@/server/services/push';

import { fail, ok, type ActionState } from './types';

/**
 * The chair-setting shift's actions.
 *
 * Nothing here writes to `assignments` or to `attendance`: this is a separate
 * day with its own arrival, its own departure and its own flat rate, and the
 * event's own records must not move because somebody put out chairs the
 * afternoon before.
 */

function revalidate(eventId: string) {
  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${eventId}`);
    revalidatePath(`${base}/events/${eventId}/attendance`);
    revalidatePath(`${base}/events/${eventId}/seats`);
    revalidatePath(`${base}/events/${eventId}/reports`);
  }
  revalidatePath('/me');
  revalidatePath('/admin/credits');
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Publishes one setup day and notifies the crew assigned to that day. */
export async function setSeatSetupStatusAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t, locale } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventManager(eventId).catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const detailId = str(form, 'detailId');
  const nextStatus = str(form, 'status');
  const allowedStatuses = ['PLANNING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED'] as const;
  if (!detailId || !allowedStatuses.includes(nextStatus as (typeof allowedStatuses)[number])) {
    return fail(t.seatSetup.needsShift);
  }
  const status = nextStatus as (typeof allowedStatuses)[number];

  const shift = await db.query.seatSetupDetails.findFirst({
    where: and(eq(seatSetupDetails.id, detailId), eq(seatSetupDetails.eventId, eventId)),
  });
  if (!shift) return fail(t.seatSetup.needsShift);
  if (shift.status === status) return ok();

  let teamMemberIds: string[] = [];
  if (status === 'READY' && shift.status !== 'READY') {
    if (!pushConfigured()) return fail(t.seatSetup.pushUnavailable);
    const crew = await db
      .select({ teamMemberId: eventMembers.teamMemberId })
      .from(seatSetupMembers)
      .innerJoin(eventMembers, eq(seatSetupMembers.eventMemberId, eventMembers.id))
      .where(
        and(
          eq(seatSetupMembers.eventId, eventId),
          eq(seatSetupMembers.detailId, detailId),
          or(ne(eventMembers.status, 'CANCELLED'), eq(eventMembers.chairSetupOnly, true)),
        ),
      );
    teamMemberIds = [...new Set(crew.map((row) => row.teamMemberId))];
    if (teamMemberIds.length === 0) return fail(t.seatSetup.readyNeedsCrew);
  }

  const readyVersion = status === 'READY' && shift.status !== 'READY'
    ? (shift.readyVersion ?? 0) + 1
    : shift.readyVersion;
  await db
    .update(seatSetupDetails)
    .set({ status, readyVersion, updatedAt: new Date() })
    .where(and(eq(seatSetupDetails.id, detailId), eq(seatSetupDetails.eventId, eventId)));

  if (status === 'READY' && shift.status !== 'READY') {
    const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
    if (event) {
      const notifiedAt = new Date();
      await db
        .update(seatSetupMembers)
        .set({ notifiedAt, updatedAt: notifiedAt })
        .where(
          and(
            eq(seatSetupMembers.eventId, eventId),
            eq(seatSetupMembers.detailId, detailId),
          ),
        );
      await pushOnce(`seat-setup-ready:${detailId}:${readyVersion}`, teamMemberIds, {
        title: t.seatSetup.readyPushTitle,
        body: format(t.seatSetup.readyPushBody, {
          event: event.name,
          date: formatDate(shift.date, locale),
          time: formatTime(shift.startTime, locale),
        }),
        url: '/me',
        tag: `seat-setup:${detailId}`,
      });
    }
  }

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'EVENT',
    summary: `${formatDate(shift.date, locale)}: ${t.seatSetup.statuses[status]}`,
    oldValues: { status: shift.status },
    newValues: { status, readyVersion },
  });
  revalidate(eventId);
  return ok();
}

/** Creates the shift, or edits its day, hours, rate and note. */
export async function saveSeatSetupAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventManager(eventId).catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const date = str(form, 'date') ?? '';
  const startTime = str(form, 'startTime') ?? '';
  const endTime = str(form, 'endTime');
  const notes = str(form, 'notes');

  if (!DATE.test(date)) return fail(t.errors.invalidDate);
  if (!CLOCK.test(startTime)) return fail(t.errors.invalidTime);
  /*
   * The end is optional — the chairs are done when they are done — but if one
   * is given it has to be after the start. This shift runs in an afternoon,
   * never across midnight, so the string comparison is the whole check.
   */
  if (endTime !== null && (!CLOCK.test(endTime) || endTime <= startTime)) {
    return fail(t.seatSetup.endBeforeStart);
  }

  const detailId = str(form, 'detailId');
  const existing = detailId
    ? await db.query.seatSetupDetails.findFirst({ where: eq(seatSetupDetails.id, detailId) })
    : null;
  if (detailId && (!existing || existing.eventId !== eventId)) return fail(t.errors.notFound);

  const raw = str(form, 'payAmount');
  if (user.role !== 'ADMIN' && raw !== null) return fail(t.errors.forbidden);
  /* A new day nobody priced (a leader adding it) starts at the event's own
     rate, the figure the admin keeps current — not a number fixed in code. */
  const eventRate = existing
    ? null
    : (await db.query.events.findFirst({ where: eq(events.id, eventId), columns: { payDefault: true } }))
        ?.payDefault ?? null;
  const fallback = existing?.payAmount ?? eventRate ?? SEAT_SETUP_PAY;
  const payAmount = user.role === 'ADMIN'
    ? raw === null
      ? fallback
      : Number(raw.replace(/[,\s]/g, ''))
    : fallback;
  if (
    !Number.isFinite(payAmount) ||
    !Number.isInteger(payAmount) ||
    payAmount < 0 ||
    payAmount > MAX_EVENT_PAY
  ) {
    return fail(t.errors.invalidCredit);
  }

  if (existing && payAmount !== existing.payAmount) {
    const paidRows = await db
      .select({ id: seatSetupMembers.id })
      .from(seatSetupMembers)
      .where(and(eq(seatSetupMembers.detailId, existing.id), isNotNull(seatSetupMembers.payoutId)))
      .limit(1);
    if (paidRows.length) return fail(t.seatSetup.paidRateLocked);
  }

  if (existing) {
    await db
      .update(seatSetupDetails)
      .set({
        date,
        startTime,
        endTime: endTime ?? null,
        notes: notes ?? null,
        payAmount,
        updatedAt: new Date(),
      })
      .where(eq(seatSetupDetails.id, existing.id));
  } else {
    await db.insert(seatSetupDetails).values({
      id: newId(),
      eventId,
      date,
      startTime,
      endTime: endTime ?? null,
      notes: notes ?? null,
      payAmount,
    });
  }

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: existing ? 'UPDATE' : 'CREATE',
    entity: 'EVENT',
    entityId: eventId,
    entityLabel: t.seatSetup.title,
    oldValues: existing
      ? { date: existing.date, startTime: existing.startTime, payAmount: existing.payAmount }
      : null,
    newValues: { date, startTime, payAmount },
    summary: `${t.seatSetup.title}: ${date} ${startTime}`,
  });

  revalidate(eventId);
  return ok();
}

/** Removes the shift and everyone on it; the event simply has none again. */
export async function removeSeatSetupAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventManager(eventId).catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const detailId = str(form, 'detailId');
  if (!detailId) return fail(t.errors.notFound);
  const existing = await db.query.seatSetupDetails.findFirst({
    where: eq(seatSetupDetails.id, detailId),
  });
  if (!existing || existing.eventId !== eventId) return ok();

  const paidRows = await db
    .select({ id: seatSetupMembers.id })
    .from(seatSetupMembers)
    .where(and(eq(seatSetupMembers.detailId, existing.id), isNotNull(seatSetupMembers.payoutId)))
    .limit(1);
  if (paidRows.length) return fail(t.seatSetup.removePaidShiftBlocked);

  await db.delete(seatSetupDetails).where(eq(seatSetupDetails.id, existing.id));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'DELETE',
    entity: 'EVENT',
    entityId: eventId,
    entityLabel: t.seatSetup.title,
    summary: t.seatSetup.removed,
  });

  revalidate(eventId);
  return ok();
}

/**
 * Sets the whole crew in one go.
 *
 * The form posts who should be on it; whoever is on it and not in that list
 * comes off. Written as one replacement rather than add-one/remove-one so
 * that "the same crew as last time" is the same operation as picking them by
 * hand, and so a half-applied list cannot survive a dropped connection.
 */
export async function setSeatSetupCrewAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t, locale } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventManager(eventId).catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const detailId = str(form, 'detailId');
  if (!detailId) return fail(t.seatSetup.needsShift);
  const detail = await db.query.seatSetupDetails.findFirst({
    where: eq(seatSetupDetails.id, detailId),
  });
  if (!detail || detail.eventId !== eventId) return fail(t.seatSetup.needsShift);

  const wanted = [...new Set(form.getAll('eventMemberId').map(String).filter(Boolean))];

  /* Regular event members keep their normal access. Outside members get a
     cancelled, chair-only membership so no event invitation or event page is exposed. */
  const wantedMembershipIds = wanted.filter((id) => !id.startsWith('team:'));
  const allowed = wantedMembershipIds.length
    ? await db.select({ id: eventMembers.id, teamMemberId: eventMembers.teamMemberId })
        .from(eventMembers)
        .where(and(
          eq(eventMembers.eventId, eventId),
          ne(eventMembers.status, 'CANCELLED'),
          eq(eventMembers.chairSetupOnly, false),
          inArray(eventMembers.id, wantedMembershipIds),
        ))
    : [];
  const keep = new Set(allowed.map((row) => row.id));
  const externalIds = wanted.filter((id) => id.startsWith('team:')).map((id) => id.slice(5));
  const activeEventTeamIds = new Set(allowed.map((row) => row.teamMemberId));
  const externalRows = externalIds.length
    ? await db.select({ id: teamMembers.id })
        .from(teamMembers)
        .where(and(eq(teamMembers.active, true), inArray(teamMembers.id, externalIds)))
    : [];
  const external = externalRows.filter((row) => !activeEventTeamIds.has(row.id));
  const externalMemberships = await Promise.all(external.map(({ id: teamMemberId }) =>
    db.select({ id: eventMembers.id, teamMemberId: eventMembers.teamMemberId }).from(eventMembers)
      .where(and(eq(eventMembers.eventId, eventId), eq(eventMembers.teamMemberId, teamMemberId), eq(eventMembers.chairSetupOnly, true)))
      .get(),
  ));
  for (const membership of externalMemberships) if (membership) keep.add(membership.id);

  const current = await db
    .select({ id: seatSetupMembers.id, eventMemberId: seatSetupMembers.eventMemberId, payoutId: seatSetupMembers.payoutId })
    .from(seatSetupMembers)
    .where(eq(seatSetupMembers.detailId, detail.id));

  const drop = current.filter((row) => !keep.has(row.eventMemberId));
  if (drop.some((row) => row.payoutId)) return fail(t.seatSetup.paidCrewCannotRemove);
  const existingIds = new Set(current.map((row) => row.eventMemberId));
  const externalAddCount = external.filter((_, index) => !externalMemberships[index]).length;
  const existingAddCount = [...keep].filter((id) => !existingIds.has(id)).length;
  const mayNotifyAdded = existingAddCount + externalAddCount > 0 && (detail.status === 'READY' || detail.status === 'IN_PROGRESS');
  if (mayNotifyAdded && !pushConfigured()) return fail(t.seatSetup.pushUnavailable);

  for (const [index, { id: teamMemberId }] of external.entries()) {
    if (externalMemberships[index]) continue;
    const membershipId = newId();
    await db.insert(eventMembers).values({
      id: membershipId,
      eventId,
      teamMemberId,
      status: 'CANCELLED',
      chairSetupOnly: true,
      token: randomBytes(16).toString('hex'),
    });
    keep.add(membershipId);
  }

  const have = new Set(current.map((row) => row.eventMemberId));
  const add = [...keep].filter((id) => !have.has(id));
  const notifyAddedCrew = add.length > 0 && (detail.status === 'READY' || detail.status === 'IN_PROGRESS');

  if (drop.length > 0) {
    await db.delete(seatSetupMembers).where(
      inArray(
        seatSetupMembers.id,
        drop.map((row) => row.id),
      ),
    );
  }
  if (add.length > 0) {
    const notifiedAt = notifyAddedCrew ? new Date() : null;
    const addedRows = add.map((eventMemberId, i) => ({
        id: newId(),
        detailId: detail.id,
        eventId,
        eventMemberId,
        notifiedAt,
        sortOrder: current.length + i,
      }));
    await db.insert(seatSetupMembers).values(addedRows);

    if (notifyAddedCrew) {
      const [event, addedCrew] = await Promise.all([
        db.query.events.findFirst({ where: eq(events.id, eventId) }),
        db
          .select({ teamMemberId: eventMembers.teamMemberId, eventMemberId: eventMembers.id })
          .from(eventMembers)
          .where(and(eq(eventMembers.eventId, eventId), inArray(eventMembers.id, add))),
      ]);
      if (event) {
        await pushOnce(`seat-setup-added:${detail.id}:${detail.readyVersion ?? 0}:${addedRows.map((row) => row.id).join(',')}`, [...new Set(addedCrew.map((row) => row.teamMemberId))], {
          title: t.seatSetup.readyPushTitle,
          body: format(t.seatSetup.readyPushBody, {
            event: event.name,
            date: formatDate(detail.date, locale),
            time: formatTime(detail.startTime, locale),
          }),
          url: '/me',
          tag: `seat-setup:${detail.id}`,
        });
      }
    }
  }

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'EVENT',
    entityId: eventId,
    entityLabel: t.seatSetup.title,
    oldValues: { crew: current.length },
    newValues: { crew: keep.size },
    summary: `${t.seatSetup.title}: ${keep.size}`,
  });

  revalidate(eventId);
  return ok();
}

/**
 * One person's day: whether it counts, and the hours if anyone wrote them.
 *
 * Both times are optional and both can be cleared. Nobody holds a clipboard
 * at the door of a room full of chairs, and a required time is a number that
 * gets invented and then has to be corrected.
 */
export async function setSeatSetupPersonAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventManager(eventId).catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const id = str(form, 'id');
  if (!id) return fail(t.errors.notFound);

  const row = await db
    .select({
      id: seatSetupMembers.id,
      eventId: seatSetupMembers.eventId,
      attended: seatSetupMembers.attended,
      name: teamMembers.fullName,
    })
    .from(seatSetupMembers)
    .innerJoin(eventMembers, eq(seatSetupMembers.eventMemberId, eventMembers.id))
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(seatSetupMembers.id, id))
    .get();
  if (!row || row.eventId !== eventId) return fail(t.errors.notFound);

  const clock = (key: string): string | null | undefined => {
    const value = form.get(key);
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (trimmed === '') return null;
    return CLOCK.test(trimmed) ? trimmed : undefined;
  };
  const checkInTime = clock('checkInTime');
  const checkOutTime = clock('checkOutTime');
  if (checkInTime === undefined && form.has('checkInTime')) {
    return fail(t.errors.invalidTime);
  }
  if (checkOutTime === undefined && form.has('checkOutTime')) {
    return fail(t.errors.invalidTime);
  }

  const attended = form.has('attended')
    ? form.get('attended') === 'on' || form.get('attended') === 'true'
    : row.attended;

  await db
    .update(seatSetupMembers)
    .set({
      attended,
      ...(checkInTime !== undefined ? { checkInTime } : {}),
      ...(checkOutTime !== undefined ? { checkOutTime } : {}),
      notes: str(form, 'notes') ?? null,
      updatedAt: new Date(),
    })
    .where(eq(seatSetupMembers.id, id));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'ATTENDANCE',
    entityId: id,
    entityLabel: row.name,
    oldValues: { attended: row.attended },
    newValues: { attended },
    summary: `${t.seatSetup.title}: ${row.name}`,
  });

  revalidate(eventId);
  return ok();
}

/** Marks the selected members present on one specific setup shift. */
export async function markSeatSetupAttendanceAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventManager(eventId).catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const detailId = str(form, 'detailId');
  if (!detailId) return fail(t.seatSetup.needsShift);

  const shift = await db.query.seatSetupDetails.findFirst({
    where: and(eq(seatSetupDetails.id, detailId), eq(seatSetupDetails.eventId, eventId)),
  });
  if (!shift) return fail(t.seatSetup.needsShift);

  const wanted = [...new Set(form.getAll('seatMemberIds').map(String).filter(Boolean))];
  if (wanted.length === 0) return fail(t.errors.required);

  const rows = await db
    .select({ id: seatSetupMembers.id })
    .from(seatSetupMembers)
    .where(
      and(
        eq(seatSetupMembers.eventId, eventId),
        eq(seatSetupMembers.detailId, detailId),
        inArray(seatSetupMembers.id, wanted),
      ),
    );
  if (rows.length === 0) return fail(t.errors.notFound);

  const updatedAt = new Date();
  await db
    .update(seatSetupMembers)
    .set({ attended: true, updatedAt })
    .where(
      and(
        eq(seatSetupMembers.eventId, eventId),
        eq(seatSetupMembers.detailId, detailId),
        inArray(seatSetupMembers.id, rows.map((row) => row.id)),
      ),
    );

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'ATTENDANCE',
    summary: `${t.seatSetup.markPresentSelected.replace('{n}', String(rows.length))}`,
    oldValues: { selected: rows.length },
    newValues: { attended: true, selected: rows.length },
  });

  revalidate(eventId);
  return ok();
}

/**
 * Takes the selected people off one chair-setup day.
 *
 * The same rule as editing the crew: a day whose pay already went into a
 * payment file stays as it is, so nobody's paid line disappears from under
 * the file that paid it. If any selected row is paid, nothing is removed.
 */
export async function removeSeatSetupMembersAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventManager(eventId).catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const detailId = str(form, 'detailId');
  if (!detailId) return fail(t.seatSetup.needsShift);
  const shift = await db.query.seatSetupDetails.findFirst({
    where: and(eq(seatSetupDetails.id, detailId), eq(seatSetupDetails.eventId, eventId)),
  });
  if (!shift) return fail(t.seatSetup.needsShift);

  const wanted = [...new Set(form.getAll('seatMemberIds').map(String).filter(Boolean))];
  if (wanted.length === 0) return fail(t.errors.required);

  const rows = await db
    .select({ id: seatSetupMembers.id, payoutId: seatSetupMembers.payoutId, name: teamMembers.fullName })
    .from(seatSetupMembers)
    .innerJoin(eventMembers, eq(seatSetupMembers.eventMemberId, eventMembers.id))
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(and(
      eq(seatSetupMembers.eventId, eventId),
      eq(seatSetupMembers.detailId, detailId),
      inArray(seatSetupMembers.id, wanted),
    ));
  if (rows.length === 0) return fail(t.errors.notFound);
  if (rows.some((row) => row.payoutId)) return fail(t.seatSetup.paidCrewCannotRemove);

  await db.delete(seatSetupMembers).where(and(
    eq(seatSetupMembers.detailId, detailId),
    inArray(seatSetupMembers.id, rows.map((row) => row.id)),
  ));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'DELETE',
    entity: 'EVENT',
    entityId: eventId,
    entityLabel: t.seatSetup.title,
    oldValues: { removed: rows.map((row) => row.name) },
    summary: `${t.seatSetup.title}: ${format(t.seatSetup.removeSelected, { n: rows.length })} — ${rows.map((row) => row.name).join('، ')}`,
  });

  revalidate(eventId);
  return ok();
}
