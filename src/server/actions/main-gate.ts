'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventMembers,
  mainGateDetails,
  mainGateMembers,
  teamMembers,
} from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { TASKS, type Task } from '@/lib/constants';
import { str } from '@/lib/validation';
import { assertEventManager } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';

import { fail, ok, type ActionState } from './types';

/**
 * The main-gate detail's actions.
 *
 * Nothing here writes to `assignments`: a person on the detail keeps the post
 * they are assigned to, and the whole point of the feature is that the two
 * facts coexist. See the schema note on `mainGateDetails`.
 */

function revalidate(eventId: string) {
  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${eventId}/board`);
    revalidatePath(`${base}/events/${eventId}/board/sheet`);
    revalidatePath(`${base}/events/${eventId}/notify`);
  }
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Creates the detail, or edits its name, hours and note. */
export async function saveMainGateAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventManager(eventId).catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const name = str(form, 'name') ?? '';
  const startTime = str(form, 'startTime') ?? '';
  const endTime = str(form, 'endTime') ?? '';
  const notes = str(form, 'notes');

  if (!name) return fail(t.errors.required);
  if (!CLOCK.test(startTime) || !CLOCK.test(endTime)) return fail(t.errors.invalidTime);
  /*
   * The detail ends before the event's own gates open, so it never runs past
   * midnight — which means a plain string comparison is the whole check and
   * an end before a start is a typo worth catching rather than a night shift.
   */
  if (endTime <= startTime) return fail(t.mainGate.endBeforeStart);

  const existing = await db.query.mainGateDetails.findFirst({
    where: eq(mainGateDetails.eventId, eventId),
  });

  if (existing) {
    await db
      .update(mainGateDetails)
      .set({ name, startTime, endTime, notes: notes ?? null, updatedAt: new Date() })
      .where(eq(mainGateDetails.id, existing.id));
  } else {
    await db.insert(mainGateDetails).values({
      id: newId(),
      eventId,
      name,
      startTime,
      endTime,
      notes: notes ?? null,
    });
  }

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: existing ? 'UPDATE' : 'CREATE',
    entity: 'EVENT',
    entityId: eventId,
    entityLabel: name,
    oldValues: existing
      ? { startTime: existing.startTime, endTime: existing.endTime }
      : null,
    newValues: { startTime, endTime },
    summary: `${t.mainGate.title}: ${name} — ${startTime} → ${endTime}`,
  });

  revalidate(eventId);
  return ok();
}

/** Removes the detail and everyone on it; the event simply has none again. */
export async function removeMainGateAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventManager(eventId).catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const existing = await db.query.mainGateDetails.findFirst({
    where: eq(mainGateDetails.eventId, eventId),
  });
  if (!existing) return ok();

  await db.delete(mainGateDetails).where(eq(mainGateDetails.id, existing.id));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'DELETE',
    entity: 'EVENT',
    entityId: eventId,
    entityLabel: existing.name,
    summary: `${t.mainGate.removed}: ${existing.name}`,
  });

  revalidate(eventId);
  return ok();
}

/** Puts one member on the detail at one job, or moves them between jobs. */
export async function setMainGateMemberAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventManager(eventId).catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const eventMemberId = str(form, 'eventMemberId');
  const raw = str(form, 'task') ?? '';
  if (!eventMemberId) return fail(t.errors.notFound);
  if (!(TASKS as readonly string[]).includes(raw)) return fail(t.errors.notFound);
  const task = raw as Task;

  const detail = await db.query.mainGateDetails.findFirst({
    where: eq(mainGateDetails.eventId, eventId),
  });
  if (!detail) return fail(t.mainGate.createFirst);

  const member = await db
    .select({ id: eventMembers.id, eventId: eventMembers.eventId, name: teamMembers.fullName })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(eventMembers.id, eventMemberId))
    .get();
  // A member of another event has no business on this detail.
  if (!member || member.eventId !== eventId) return fail(t.errors.notFound);

  const already = await db.query.mainGateMembers.findFirst({
    where: and(
      eq(mainGateMembers.detailId, detail.id),
      eq(mainGateMembers.eventMemberId, eventMemberId),
    ),
  });

  if (already) {
    await db
      .update(mainGateMembers)
      .set({ task, updatedAt: new Date() })
      .where(eq(mainGateMembers.id, already.id));
  } else {
    const count = await db.$count(
      mainGateMembers,
      eq(mainGateMembers.detailId, detail.id),
    );
    await db.insert(mainGateMembers).values({
      id: newId(),
      detailId: detail.id,
      eventId,
      eventMemberId,
      task,
      sortOrder: count,
    });
  }

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'EVENT_MEMBER',
    entityId: eventMemberId,
    entityLabel: member.name,
    newValues: { mainGateTask: task },
    summary: `${t.mainGate.title}: ${member.name} — ${t.enums.task[task]}`,
  });

  revalidate(eventId);
  return ok();
}

/** Takes one member off the detail. Their event assignment is untouched. */
export async function removeMainGateMemberAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventManager(eventId).catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const rowId = str(form, 'rowId');
  if (!rowId) return fail(t.errors.notFound);

  const row = await db
    .select({
      id: mainGateMembers.id,
      eventId: mainGateMembers.eventId,
      name: teamMembers.fullName,
    })
    .from(mainGateMembers)
    .innerJoin(eventMembers, eq(mainGateMembers.eventMemberId, eventMembers.id))
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(mainGateMembers.id, rowId))
    .get();
  if (!row || row.eventId !== eventId) return fail(t.errors.notFound);

  await db.delete(mainGateMembers).where(eq(mainGateMembers.id, rowId));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'EVENT_MEMBER',
    entityId: rowId,
    entityLabel: row.name,
    newValues: { mainGateTask: null },
    summary: `${t.mainGate.removedMember}: ${row.name}`,
  });

  revalidate(eventId);
  return ok();
}
