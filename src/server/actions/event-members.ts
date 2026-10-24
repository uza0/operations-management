'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, ne } from 'drizzle-orm';

import { db } from '@/db';
import {
  announcements,
  assignments,
  attendance,
  eventFeedback,
  eventMembers,
  issues,
  mainGateMembers,
  mapMarkers,
  teamMembers,
} from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { newId, newMemberToken } from '@/lib/ids';
import { bool, str } from '@/lib/validation';
import { assertEventManager } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';

import { fail, ok, type ActionState } from './types';

function revalidateEvent(eventId: string) {
  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${eventId}`);
    revalidatePath(`${base}/events/${eventId}/team`);
    revalidatePath(`${base}/events/${eventId}/assignments`);
    revalidatePath(`${base}/events/${eventId}/attendance`);
  }
}

/** Adds people from the reusable team database to this event (spec §12). */
export async function addMembersToEventAction(
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

  const ids = form.getAll('memberIds').map(String).filter(Boolean);
  if (ids.length === 0) return fail(t.errors.required);

  const asReserve = bool(form, 'isReserve');

  const people = await db
    .select({ id: teamMembers.id, fullName: teamMembers.fullName })
    .from(teamMembers)
    .where(inArray(teamMembers.id, ids));

  const already = await db
    .select({
      id: eventMembers.id,
      teamMemberId: eventMembers.teamMemberId,
      status: eventMembers.status,
    })
    .from(eventMembers)
    .where(eq(eventMembers.eventId, eventId));

  /*
   * Someone whose participation was cancelled still has a row — there is one
   * row per person per event and a unique index to prove it — so adding them
   * again is reinstating that row, not inserting a second one. Without this,
   * cancelling somebody by mistake made them impossible to put back: the
   * picker skipped them as "already on the event" and the insert would have
   * collided with the index anyway.
   */
  const onEvent = new Map(already.map((r) => [r.teamMemberId, r]));
  const toReinstate = people.filter((p) => onEvent.get(p.id)?.status === 'CANCELLED');
  const toAdd = people.filter((p) => !onEvent.has(p.id));

  if (toAdd.length === 0 && toReinstate.length === 0) return ok();

  if (toReinstate.length > 0) {
    await db
      .update(eventMembers)
      .set({
        status: 'INVITED',
        isReserve: asReserve,
        // A fresh key: the one they had was burned when they were cancelled.
        token: newMemberToken(),
        tokenExpiresAt: null,
        notifiedAt: null,
        notifiedById: null,
        updatedAt: new Date(),
      })
      .where(
        inArray(
          eventMembers.id,
          toReinstate.map((p) => onEvent.get(p.id)!.id),
        ),
      );
  }

  if (toAdd.length > 0) {
    await db.insert(eventMembers).values(
      toAdd.map((p) => ({
        id: newId(),
        eventId,
        teamMemberId: p.id,
        status: 'INVITED',
        token: newMemberToken(),
        tokenExpiresAt: null,
        isReserve: asReserve,
      })),
    );
  }

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'CREATE',
    entity: 'EVENT_MEMBER',
    entityLabel: [...toAdd, ...toReinstate].map((p) => p.fullName).join('، '),
    newValues: {
      count: toAdd.length,
      reinstated: toReinstate.length,
      reserve: asReserve,
    },
    summary: `${t.eventTeam.addToEvent}: ${toAdd.length + toReinstate.length}`,
  });

  revalidateEvent(eventId);
  return ok();
}

export async function updateEventMemberAction(
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

  const id = str(form, 'eventMemberId');
  if (!id) return fail(t.errors.notFound);

  const row = await db
    .select({
      id: eventMembers.id,
      eventId: eventMembers.eventId,
      isReserve: eventMembers.isReserve,
      status: eventMembers.status,
      name: teamMembers.fullName,
    })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(eventMembers.id, id))
    .get();
  if (!row || row.eventId !== eventId) return fail(t.errors.notFound);

  const nextStatus = str(form, 'status');
  const nextReserve = form.has('isReserve') ? bool(form, 'isReserve') : row.isReserve;

  await db
    .update(eventMembers)
    .set({
      status: nextStatus ?? row.status,
      isReserve: nextReserve,
      updatedAt: new Date(),
    })
    .where(eq(eventMembers.id, id));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'EVENT_MEMBER',
    entityId: id,
    entityLabel: row.name,
    oldValues: { status: row.status, reserve: row.isReserve },
    newValues: { status: nextStatus ?? row.status, reserve: nextReserve },
    summary: `${row.name} — ${t.enums.auditAction.UPDATE}`,
  });

  revalidateEvent(eventId);
  return ok();
}

/**
 * Rotating a token invalidates the old personal link immediately — the fix
 * when a link is shared with the wrong person (spec §3.4).
 */
export async function rotateMemberTokenAction(
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

  const id = str(form, 'eventMemberId');
  if (!id) return fail(t.errors.notFound);

  const row = await db
    .select({
      id: eventMembers.id,
      eventId: eventMembers.eventId,
      name: teamMembers.fullName,
    })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(eventMembers.id, id))
    .get();
  if (!row || row.eventId !== eventId) return fail(t.errors.notFound);

  await db
    .update(eventMembers)
    .set({ token: newMemberToken(), updatedAt: new Date() })
    .where(eq(eventMembers.id, id));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'TOKEN_ROTATE',
    entity: 'EVENT_MEMBER',
    entityId: id,
    entityLabel: row.name,
    summary: `${t.eventTeam.rotateToken}: ${row.name}`,
  });

  revalidateEvent(eventId);
  return ok();
}

/** Cancels participation; the personal link stops working at once. */
export async function revokeEventMemberAction(
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

  const id = str(form, 'eventMemberId');
  if (!id) return fail(t.errors.notFound);

  const row = await db
    .select({
      id: eventMembers.id,
      eventId: eventMembers.eventId,
      name: teamMembers.fullName,
    })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(eventMembers.id, id))
    .get();
  if (!row || row.eventId !== eventId) return fail(t.errors.notFound);

  const active = await db.$count(
    assignments,
    and(eq(assignments.eventMemberId, id), ne(assignments.status, 'CANCELLED')),
  );
  if (active > 0) return fail(t.eventTeam.removeBlocked);

  await db
    .update(eventMembers)
    .set({ status: 'CANCELLED', token: newMemberToken(), updatedAt: new Date() })
    .where(eq(eventMembers.id, id));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'EVENT_MEMBER',
    entityId: id,
    entityLabel: row.name,
    newValues: { status: 'CANCELLED' },
    summary: `${t.eventTeam.revoke}: ${row.name}`,
  });

  revalidateEvent(eventId);
  return ok();
}

/**
 * Takes somebody off this event for good.
 *
 * Cancelling and deleting answer two different situations, and the team page
 * needs both. Cancelling says "he was on this event and is not working it" —
 * the row stays, greyed, and can be undone, which is what you want for a man
 * who pulled out the night before. Deleting says "he was never on this
 * event": somebody added the wrong name, or added the same man twice, and the
 * count at the top of the page should read one lower because the team really
 * is one smaller. Cancelling cannot do that — a mistake left visible forever
 * is still a mistake, and a team of 41 that is really 40 makes every staffing
 * sum on the board wrong.
 *
 * It removes him from this event only. His record in the team database is
 * untouched, so he can be added again, here or anywhere else.
 *
 * SQLite enforces foreign keys only when asked to, and this connection does
 * not ask, so the rows that hang off a participant are cleared by hand rather
 * than left to a cascade that will not fire. What goes: his place on the
 * board, his attendance line, his feedback, his seat at the main gate, the
 * announcements written to him alone, and his pin on the map. What stays:
 * every problem he reported, with his name on it as he gave it — operational
 * history belongs to the event, not to the man, and an incident that loses
 * its reporter the day somebody tidies a list is worth nothing afterwards.
 */
export async function deleteEventMemberAction(
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

  const id = str(form, 'eventMemberId');
  if (!id) return fail(t.errors.notFound);

  const row = await db
    .select({
      id: eventMembers.id,
      eventId: eventMembers.eventId,
      status: eventMembers.status,
      name: teamMembers.fullName,
    })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(eventMembers.id, id))
    .get();
  if (!row || row.eventId !== eventId) return fail(t.errors.notFound);

  const placed = await db.$count(
    assignments,
    and(eq(assignments.eventMemberId, id), ne(assignments.status, 'CANCELLED')),
  );

  await db.delete(assignments).where(eq(assignments.eventMemberId, id));
  await db.delete(attendance).where(eq(attendance.eventMemberId, id));
  await db.delete(eventFeedback).where(eq(eventFeedback.eventMemberId, id));
  await db.delete(mainGateMembers).where(eq(mainGateMembers.eventMemberId, id));
  await db.delete(announcements).where(eq(announcements.eventMemberId, id));
  await db.delete(mapMarkers).where(eq(mapMarkers.eventMemberId, id));
  await db
    .update(issues)
    .set({ reportedByMemberId: null })
    .where(eq(issues.reportedByMemberId, id));
  await db.delete(eventMembers).where(eq(eventMembers.id, id));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'DELETE',
    entity: 'EVENT_MEMBER',
    entityId: id,
    entityLabel: row.name,
    oldValues: { status: row.status, assignments: placed },
    summary: `${t.eventTeam.remove}: ${row.name}`,
  });

  revalidateEvent(eventId);
  revalidatePath(`/admin/events/${eventId}/board`);
  revalidatePath(`/leader/events/${eventId}/board`);
  return ok();
}

/**
 * Puts a cancelled participant back on the event.
 *
 * The counterpart to revoking, and on the same card — cancelling somebody by
 * mistake should be undone where it was done, not by going to another screen
 * and searching for them. They come back as INVITED rather than straight to
 * ACTIVE: being on the team again is not the same as having been told.
 */
export async function reinstateEventMemberAction(
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

  const id = str(form, 'eventMemberId');
  if (!id) return fail(t.errors.notFound);

  const row = await db
    .select({
      id: eventMembers.id,
      eventId: eventMembers.eventId,
      status: eventMembers.status,
      name: teamMembers.fullName,
    })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(eventMembers.id, id))
    .get();
  if (!row || row.eventId !== eventId) return fail(t.errors.notFound);
  if (row.status !== 'CANCELLED') return ok();

  await db
    .update(eventMembers)
    .set({
      status: 'INVITED',
      // A new personal link, for the same reason adding one does.
      token: newMemberToken(),
      tokenExpiresAt: null,
      notifiedAt: null,
      notifiedById: null,
      updatedAt: new Date(),
    })
    .where(eq(eventMembers.id, id));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'EVENT_MEMBER',
    entityId: id,
    entityLabel: row.name,
    oldValues: { status: 'CANCELLED' },
    newValues: { status: 'INVITED' },
    summary: `${t.eventTeam.reinstate}: ${row.name}`,
  });

  revalidateEvent(eventId);
  return ok();
}
