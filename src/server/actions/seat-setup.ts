'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, ne } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventMembers,
  seatSetupDetails,
  seatSetupMembers,
  teamMembers,
} from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { SEAT_SETUP_PAY, MAX_EVENT_PAY } from '@/lib/money';
import { str } from '@/lib/validation';
import { assertEventManager } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';

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
  revalidatePath('/admin/credits');
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

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

  const raw = str(form, 'payAmount');
  const payAmount = raw === null ? SEAT_SETUP_PAY : Number(raw.replace(/[,\s]/g, ''));
  if (
    !Number.isFinite(payAmount) ||
    !Number.isInteger(payAmount) ||
    payAmount < 0 ||
    payAmount > MAX_EVENT_PAY
  ) {
    return fail(t.errors.invalidCredit);
  }

  /*
   * One of possibly several days. Editing addresses a day by id; adding one
   * sends no id at all, which is how the same form does both.
   */
  const detailId = str(form, 'detailId');
  const existing = detailId
    ? await db.query.seatSetupDetails.findFirst({ where: eq(seatSetupDetails.id, detailId) })
    : null;
  if (detailId && (!existing || existing.eventId !== eventId)) return fail(t.errors.notFound);

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
  const { t } = await getT();
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

  /* Only people actually on this event, and not cancelled. */
  const allowed =
    wanted.length === 0
      ? []
      : await db
          .select({ id: eventMembers.id })
          .from(eventMembers)
          .where(
            and(
              eq(eventMembers.eventId, eventId),
              ne(eventMembers.status, 'CANCELLED'),
              inArray(eventMembers.id, wanted),
            ),
          );
  const keep = new Set(allowed.map((row) => row.id));

  const current = await db
    .select({ id: seatSetupMembers.id, eventMemberId: seatSetupMembers.eventMemberId })
    .from(seatSetupMembers)
    .where(eq(seatSetupMembers.detailId, detail.id));

  const drop = current.filter((row) => !keep.has(row.eventMemberId));
  const have = new Set(current.map((row) => row.eventMemberId));
  const add = [...keep].filter((id) => !have.has(id));

  if (drop.length > 0) {
    await db.delete(seatSetupMembers).where(
      inArray(
        seatSetupMembers.id,
        drop.map((row) => row.id),
      ),
    );
  }
  if (add.length > 0) {
    await db.insert(seatSetupMembers).values(
      add.map((eventMemberId, i) => ({
        id: newId(),
        detailId: detail.id,
        eventId,
        eventMemberId,
        sortOrder: current.length + i,
      })),
    );
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
