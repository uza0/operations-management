'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { assignments, eventMembers, events, gates, teamMembers, workingPoints } from '@/db/schema';
import { format } from '@/lib/i18n';
import { getT } from '@/lib/i18n/server';
import { newMemberToken } from '@/lib/ids';
import {
  EVENT_ROLES,
  EVENT_ROLE_SCOPE,
  TASKS,
  type EventRole,
  type Task,
} from '@/lib/constants';
import { str } from '@/lib/validation';
import { assertEventManager } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';
import { parseLanes } from '@/server/services/board';

import { saveAssignmentAction } from './assignments';
import { fail, idle, ok, type ActionState } from './types';

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
 * Gives one member a role for this event, or takes it away.
 *
 * A role is a hat, and a hat is worn by one person at a time. Handing it to
 * somebody else therefore takes it off whoever had it rather than refusing —
 * at five o'clock on a match day, "that role is taken" is a worse answer than
 * simply moving it and saying whose head it came off. How far "taken" reaches
 * is the role's scope (EVENT_ROLE_SCOPE): the team leader is one per event, a
 * gate leader one per gate, a section supervisor one per job within a gate.
 */
export async function setMemberRoleAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventManager(eventId).catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const eventMemberId = str(form, 'eventMemberId');
  if (!eventMemberId) return fail(t.errors.notFound);

  const raw = str(form, 'role') ?? '';
  const role = (EVENT_ROLES as readonly string[]).includes(raw) ? (raw as EventRole) : null;

  const member = await db
    .select({
      id: eventMembers.id,
      eventId: eventMembers.eventId,
      eventRole: eventMembers.eventRole,
      name: teamMembers.fullName,
    })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(eventMembers.id, eventMemberId))
    .get();
  if (!member || member.eventId !== eventId) return fail(t.errors.notFound);

  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.eventMemberId, eventMemberId),
  });

  /*
   * A gate leader leads a gate and a section supervisor runs a job at one, so
   * both need the person to be standing somewhere first. The team leader and
   * his assistant lead the whole team and may still be in the pool.
   */
  if (role && EVENT_ROLE_SCOPE[role] !== 'EVENT' && !assignment) {
    return fail(t.board.roleNeedsPlace);
  }

  // Everyone the new role would collide with, by how far that role reaches.
  let displaced: { id: string; name: string }[] = [];
  if (role) {
    const holders = await db
      .select({
        id: eventMembers.id,
        name: teamMembers.fullName,
        gateId: assignments.gateId,
        workingPointId: assignments.workingPointId,
        task: assignments.task,
      })
      .from(eventMembers)
      .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
      .leftJoin(assignments, eq(assignments.eventMemberId, eventMembers.id))
      .where(
        and(eq(eventMembers.eventId, eventId), eq(eventMembers.eventRole, role)),
      );

    const scope = EVENT_ROLE_SCOPE[role];
    const here = assignment?.gateId ?? assignment?.workingPointId ?? null;
    displaced = holders
      .filter((holder) => {
        if (holder.id === eventMemberId) return false;
        if (scope === 'EVENT') return true;
        const theirs = holder.gateId ?? holder.workingPointId ?? null;
        if (theirs !== here) return false;
        return scope === 'GATE' || holder.task === assignment?.task;
      })
      .map((holder) => ({ id: holder.id, name: holder.name }));

    for (const person of displaced) {
      await db
        .update(eventMembers)
        .set({ eventRole: null, updatedAt: new Date() })
        .where(eq(eventMembers.id, person.id));
      await db
        .update(assignments)
        .set({ isGateLeader: false })
        .where(eq(assignments.eventMemberId, person.id));
    }
  }

  await db
    .update(eventMembers)
    .set({ eventRole: role, updatedAt: new Date() })
    .where(eq(eventMembers.id, eventMemberId));

  /*
   * Gate leadership was already recorded in two places before roles existed —
   * on the assignment and on the gate — and every screen that shows a gate
   * leader reads those. Keeping them in step is what makes the new role the
   * same fact rather than a second, competing one.
   */
  if (assignment) {
    const leads = role === 'GATE_LEADER';
    await db
      .update(assignments)
      .set({ isGateLeader: leads })
      .where(eq(assignments.id, assignment.id));
    if (assignment.gateId) {
      if (leads) {
        await db
          .update(gates)
          .set({ gateLeaderId: eventMemberId, updatedAt: new Date() })
          .where(eq(gates.id, assignment.gateId));
      } else {
        await db
          .update(gates)
          .set({ gateLeaderId: null, updatedAt: new Date() })
          .where(
            and(eq(gates.id, assignment.gateId), eq(gates.gateLeaderId, eventMemberId)),
          );
      }
    }
  }

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'EVENT_MEMBER',
    entityId: eventMemberId,
    entityLabel: member.name,
    oldValues: { eventRole: member.eventRole },
    newValues: { eventRole: role },
    summary: role
      ? `${member.name}: ${t.enums.eventRole[role]}`
      : `${member.name}: ${t.board.roleNone}`,
  });

  revalidateBoard(eventId);
  return displaced.length > 0
    ? ok(format(t.board.roleMoved, { name: displaced.map((p) => p.name).join('، ') }))
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

/* ===========================================================================
   Doing the same thing to several people at once.

   Distributing ninety promoters one tap at a time is the part of this job that
   actually takes the evening, and most of those taps are the same decision
   repeated: these eight go to gate 3, these five come back off the board.
   So the board can hold a selection, and these three actions are what it does
   with one.

   They are loops over the single-person actions above rather than a second,
   faster path into the database. That is deliberate: a batch move has to leave
   exactly the same trail as a careful one — the same conflict handling, the
   same reassignment record per person, the same audit line per person — and
   the only thing a batch is allowed to save is the round trips. One request,
   the same history.

   A batch stops at the first failure and says how far it got, rather than
   reporting a single failure as if nothing happened or pressing on and leaving
   the supervisor to work out which of eight names moved.
   =========================================================================== */

/** Ids from a repeated `eventMemberIds` field, de-duplicated, capped. */
function idsFrom(form: FormData): string[] {
  const seen = new Set<string>();
  for (const value of form.getAll('eventMemberIds')) {
    const id = String(value).trim();
    if (id) seen.add(id);
  }
  // A board holds a few hundred people at most; anything past that is a bug
  // or an attempt to make one request do a day's work.
  return [...seen].slice(0, 300);
}

async function runEach(
  ids: string[],
  build: (id: string) => FormData,
  run: (prev: ActionState, form: FormData) => Promise<ActionState>,
  t: { errors: { notFound: string } },
): Promise<ActionState> {
  if (ids.length === 0) return fail(t.errors.notFound);
  let done = 0;
  for (const id of ids) {
    const result = await run(idle, build(id));
    if (result.status === 'error' || result.status === 'conflict') {
      return done === 0
        ? result
        : fail(`${result.message} (${done}/${ids.length})`);
    }
    done += 1;
  }
  return ok();
}

/** Puts every selected member into one lane. */
export async function placeManyOnLaneAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const lane = str(form, 'lane') ?? '';
  if (!(await assertEventManager(eventId).catch(() => null))) {
    return fail(t.errors.forbidden);
  }
  return runEach(
    idsFrom(form),
    (id) => {
      const body = new FormData();
      body.set('eventId', eventId);
      body.set('eventMemberId', id);
      body.set('lane', lane);
      return body;
    },
    placeOnLaneAction,
    t,
  );
}

/** Takes every selected member off the board. */
export async function clearManyFromBoardAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  if (!(await assertEventManager(eventId).catch(() => null))) {
    return fail(t.errors.forbidden);
  }
  return runEach(
    idsFrom(form),
    (id) => {
      const body = new FormData();
      body.set('eventId', eventId);
      body.set('eventMemberId', id);
      return body;
    },
    clearFromBoardAction,
    t,
  );
}

/**
 * Gives every selected member the same role.
 *
 * The exclusive roles stay exclusive: team leader and gate leader move to the
 * last person in the selection rather than being held by several at once,
 * because `setMemberRoleAction` takes the role off whoever had it. Handing an
 * exclusive role to a selection is therefore a slightly odd thing to do, and
 * the dialog says so rather than quietly picking a winner.
 */
export async function setManyMemberRolesAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const role = str(form, 'role') ?? '';
  if (!(await assertEventManager(eventId).catch(() => null))) {
    return fail(t.errors.forbidden);
  }
  return runEach(
    idsFrom(form),
    (id) => {
      const body = new FormData();
      body.set('eventId', eventId);
      body.set('eventMemberId', id);
      body.set('role', role);
      return body;
    },
    setMemberRoleAction,
    t,
  );
}
