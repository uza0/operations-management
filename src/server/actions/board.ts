'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { assignments, eventMembers, events, gates, teamMembers, workingPoints } from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { newMemberToken } from '@/lib/ids';
import { TASKS, type Task } from '@/lib/constants';
import { str } from '@/lib/validation';
import { assertEventManager } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';
import { parseLanes } from '@/server/services/board';

import { saveAssignmentAction } from './assignments';
import { fail, ok, type ActionState } from './types';

/**
 * The board's own actions.
 *
 * Placing a name is deliberately a thin wrapper over saveAssignmentAction
 * rather than a second way of writing an assignment: the board moves people
 * around quickly, and a quick move has to leave exactly the same history as a
 * careful one — same conflict check, same reassignment record, same audit line.
 */

function revalidateBoard(eventId: string) {
  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${eventId}`);
    revalidatePath(`${base}/events/${eventId}/board`);
    revalidatePath(`${base}/events/${eventId}/assignments`);
    revalidatePath(`${base}/events/${eventId}/gates`);
  }
}

/** Puts one member into one lane — "<locationId>:<TASK>". */
export async function placeOnLaneAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventManager(eventId).catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const eventMemberId = str(form, 'eventMemberId');
  const laneKey = str(form, 'lane');
  if (!eventMemberId || !laneKey) return fail(t.errors.notFound);

  const separator = laneKey.lastIndexOf(':');
  const locationId = laneKey.slice(0, separator);
  const task = laneKey.slice(separator + 1) as Task;
  if (!locationId || !(TASKS as readonly string[]).includes(task)) {
    return fail(t.errors.notFound);
  }

  const [gate, point, event] = await Promise.all([
    db.query.gates.findFirst({ where: eq(gates.id, locationId) }),
    db.query.workingPoints.findFirst({ where: eq(workingPoints.id, locationId) }),
    db.query.events.findFirst({ where: eq(events.id, eventId) }),
  ]);
  const location = gate ?? point;
  if (!event || !location || location.eventId !== eventId) return fail(t.errors.notFound);

  // The member's current assignment, so this moves them instead of duplicating.
  const existing = await db.query.assignments.findFirst({
    where: eq(assignments.eventMemberId, eventMemberId),
  });

  /*
   * The hours come from the event, and a member who already has hours of their
   * own keeps them: moving someone between gates is not a reason to rewrite
   * when they start and finish.
   */
  const arrival = existing?.arrivalTime ?? event.teamArrivalTime;
  const shiftStart = existing?.shiftStart ?? event.teamArrivalTime;
  const shiftEnd = existing?.shiftEnd ?? event.teamDepartureTime ?? '22:30';

  const next = new FormData();
  next.set('eventId', eventId);
  next.set('eventMemberId', eventMemberId);
  if (gate) next.set('gateId', locationId);
  else next.set('workingPointId', locationId);
  next.set('task', task);
  next.set('arrivalTime', arrival);
  next.set('shiftStart', shiftStart);
  next.set('shiftEnd', shiftEnd);
  if (existing) {
    next.set('assignmentId', existing.id);
    if (existing.isGateLeader) next.set('isGateLeader', 'on');
    if (existing.notes) next.set('notes', existing.notes);
    // Moving on the board is the reason; the history line says so.
    next.set('reason', t.board.movedOnBoard);
  }
  // A board drag is a decision already made; the conflict dialog belongs to the
  // assignment form, not here.
  next.set('force', '1');

  return saveAssignmentAction({ status: 'idle' }, next);
}

/** Takes a member off the board and back into the pool. */
export async function clearFromBoardAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventManager(eventId).catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const eventMemberId = str(form, 'eventMemberId');
  if (!eventMemberId) return fail(t.errors.notFound);

  const row = await db
    .select({
      id: assignments.id,
      eventId: assignments.eventId,
      name: teamMembers.fullName,
    })
    .from(assignments)
    .innerJoin(eventMembers, eq(assignments.eventMemberId, eventMembers.id))
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(assignments.eventMemberId, eventMemberId))
    .get();
  if (!row || row.eventId !== eventId) return fail(t.errors.notFound);

  /*
   * Deleted rather than cancelled. A cancelled assignment is a record that
   * someone was moved off a post during an event; a name pulled back while the
   * board is still being filled is a draft being corrected, and leaving a trail
   * of cancellations for every second thought would bury the real ones.
   */
  await db.delete(assignments).where(eq(assignments.id, row.id));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'DELETE',
    entity: 'ASSIGNMENT',
    entityId: row.id,
    entityLabel: row.name,
    oldValues: null,
    newValues: null,
    summary: `${t.board.returnedToPool}: ${row.name}`,
  });

  revalidateBoard(eventId);
  return ok();
}

/** Sets which jobs a location is divided into on the board. */
export async function setLanesAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventManager(eventId).catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const locationId = str(form, 'locationId');
  if (!locationId) return fail(t.errors.notFound);

  const chosen = form
    .getAll('lane')
    .map(String)
    .filter((value): value is Task => (TASKS as readonly string[]).includes(value));
  if (chosen.length === 0) return fail(t.board.needsOneLane);

  const gate = await db.query.gates.findFirst({ where: eq(gates.id, locationId) });
  const point = gate
    ? null
    : await db.query.workingPoints.findFirst({ where: eq(workingPoints.id, locationId) });
  const location = gate ?? point;
  if (!location || location.eventId !== eventId) return fail(t.errors.notFound);

  /*
   * Removing a lane that still holds people would strand them: their task no
   * longer matches any column. They are kept by adding their task back, and the
   * supervisor is told rather than silently overruled.
   */
  const occupied = await db
    .select({ task: assignments.task })
    .from(assignments)
    .where(
      gate
        ? eq(assignments.gateId, locationId)
        : eq(assignments.workingPointId, locationId),
    );
  const stillNeeded = [...new Set(occupied.map((row) => row.task as Task))].filter(
    (task) => !chosen.includes(task),
  );
  const lanes = [...chosen, ...stillNeeded];

  const previous = parseLanes(location.lanes, gate ? 'GATE' : 'POINT');
  if (gate) {
    await db
      .update(gates)
      .set({ lanes: JSON.stringify(lanes), updatedAt: new Date() })
      .where(eq(gates.id, locationId));
  } else {
    await db
      .update(workingPoints)
      .set({ lanes: JSON.stringify(lanes), updatedAt: new Date() })
      .where(eq(workingPoints.id, locationId));
  }

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: gate ? 'GATE' : 'WORKING_POINT',
    entityId: locationId,
    entityLabel: location.name,
    oldValues: { lanes: previous },
    newValues: { lanes },
    summary: `${location.name}: ${lanes.map((l) => t.enums.task[l]).join(' · ')}`,
  });

  revalidateBoard(eventId);
  return stillNeeded.length > 0
    ? fail(t.board.laneKept)
    : ok();
}

/**
 * Issues or replaces the public link to the distribution sheet.
 *
 * Replacing is how the link is revoked: every copy already sent stops working
 * the moment a new token is written.
 */
export async function rotateBoardLinkAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventManager(eventId).catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const disable = str(form, 'disable') === '1';
  const token = disable ? null : newMemberToken();

  await db
    .update(events)
    .set({ boardToken: token, updatedAt: new Date() })
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
    // The token itself never goes in the log — a log is read by more people
    // than the link is meant for.
    newValues: { sheetLink: disable ? 'revoked' : 'issued' },
    summary: disable ? t.board.linkRevoked : t.board.linkIssued,
  });

  revalidateBoard(eventId);
  revalidatePath(`/admin/events/${eventId}/notify`);
  return ok();
}
