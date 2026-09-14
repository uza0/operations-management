'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, ne } from 'drizzle-orm';

import { db } from '@/db';
import {
  assignmentChanges,
  assignments,
  eventMembers,
  gates,
  teamMembers,
  workingPoints,
} from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { format } from '@/lib/i18n';
import { newId } from '@/lib/ids';
import { assignmentSchema, bool, firstIssueKey, str } from '@/lib/validation';
import { formatTime, toMinutes } from '@/lib/time';
import type { Task } from '@/lib/constants';
import { assertEventManager } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';
import {
  findScheduleConflict,
  locationLabel,
} from '@/server/services/assignments';

import { fail, ok, type ActionState } from './types';

function revalidateEvent(eventId: string) {
  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${eventId}`);
    revalidatePath(`${base}/events/${eventId}/assignments`);
    revalidatePath(`${base}/events/${eventId}/gates`);
    revalidatePath(`${base}/events/${eventId}/team`);
    revalidatePath(`${base}/events/${eventId}/map`);
  }
}

function parseForm(form: FormData) {
  return assignmentSchema.safeParse({
    eventMemberId: str(form, 'eventMemberId') ?? '',
    gateId: str(form, 'gateId'),
    workingPointId: str(form, 'workingPointId'),
    task: str(form, 'task') ?? 'OTHER',
    arrivalTime: str(form, 'arrivalTime') ?? '',
    shiftStart: str(form, 'shiftStart') ?? '',
    shiftEnd: str(form, 'shiftEnd') ?? '',
    isGateLeader: bool(form, 'isGateLeader'),
    notes: str(form, 'notes'),
  });
}

/**
 * Create or update one assignment.
 *
 * Guards, in order (spec §14):
 *   1. caller may manage this event
 *   2. exactly one of gate / working point, and it still exists in this event
 *   3. the member belongs to this event
 *   4. shift end after shift start
 *   5. no overlapping active assignment — returned as a soft "conflict" the
 *      leader can override deliberately, never silently
 * Changing location, task or arrival time writes an assignment_changes row and
 * an audit entry, so "who moved Amir, when and why" is always answerable.
 */
export async function saveAssignmentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { locale, t } = await getT();
  const eventId = String(form.get('eventId') ?? '');

  let user;
  try {
    user = await assertEventManager(eventId);
  } catch {
    return fail(t.errors.forbidden);
  }

  const parsed = parseForm(form);
  if (!parsed.success) {
    const key = firstIssueKey(parsed.error);
    if (key === 'locationExclusive') {
      return fail(
        str(form, 'gateId') || str(form, 'workingPointId')
          ? t.assignment.locationExclusive
          : t.assignment.locationRequired,
      );
    }
    const errors = t.errors as unknown as Record<string, string>;
    return fail(errors[key] ?? t.errors.generic);
  }
  const data = parsed.data;

  if (toMinutes(data.shiftEnd) === toMinutes(data.shiftStart)) {
    return fail(t.assignment.invalidShift);
  }

  // The location must exist and belong to this event.
  if (data.gateId) {
    const gate = await db.query.gates.findFirst({ where: eq(gates.id, data.gateId) });
    if (!gate || gate.eventId !== eventId) return fail(t.errors.notFound);
  } else if (data.workingPointId) {
    const point = await db.query.workingPoints.findFirst({
      where: eq(workingPoints.id, data.workingPointId),
    });
    if (!point || point.eventId !== eventId) return fail(t.errors.notFound);
  }

  const member = await db
    .select({
      id: eventMembers.id,
      name: teamMembers.fullName,
      eventId: eventMembers.eventId,
      status: eventMembers.status,
    })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(eventMembers.id, data.eventMemberId))
    .get();

  if (!member || member.eventId !== eventId) return fail(t.errors.notFound);
  if (member.status === 'CANCELLED') return fail(t.errors.forbidden);

  const assignmentId = str(form, 'assignmentId');
  const existing = assignmentId
    ? await db.query.assignments.findFirst({ where: eq(assignments.id, assignmentId) })
    : null;
  if (assignmentId && (!existing || existing.eventId !== eventId)) {
    return fail(t.errors.notFound);
  }

  if (!bool(form, 'force')) {
    const conflict = await findScheduleConflict(
      eventId,
      data.eventMemberId,
      data.shiftStart,
      data.shiftEnd,
      existing?.id,
    );
    if (conflict) {
      return {
        status: 'conflict',
        message: format(t.assignment.conflictBody, {
          member: member.name,
          location: conflict.locationName,
          from: formatTime(conflict.shiftStart, locale),
          to: formatTime(conflict.shiftEnd, locale),
        }),
      };
    }
  }

  const newLocation = await locationLabel(data.gateId ?? null, data.workingPointId ?? null);

  if (existing) {
    const oldLocation = await locationLabel(existing.gateId, existing.workingPointId);
    const moved =
      existing.gateId !== (data.gateId ?? null) ||
      existing.workingPointId !== (data.workingPointId ?? null);
    const taskChanged = existing.task !== data.task;
    const arrivalChanged = existing.arrivalTime !== data.arrivalTime;
    const reason = str(form, 'reason');

    await db
      .update(assignments)
      .set({
        gateId: data.gateId ?? null,
        workingPointId: data.workingPointId ?? null,
        task: data.task,
        arrivalTime: data.arrivalTime,
        shiftStart: data.shiftStart,
        shiftEnd: data.shiftEnd,
        isGateLeader: data.isGateLeader ?? false,
        notes: data.notes ?? null,
        status: moved ? 'CHANGED' : existing.status,
        updatedById: user.id,
        updatedAt: new Date(),
      })
      .where(eq(assignments.id, existing.id));

    if (moved || taskChanged || arrivalChanged) {
      await db.insert(assignmentChanges).values({
        id: newId(),
        assignmentId: existing.id,
        fromLocation: moved ? oldLocation : null,
        toLocation: moved ? newLocation : null,
        fromTask: taskChanged ? existing.task : null,
        toTask: taskChanged ? data.task : null,
        fromArrival: arrivalChanged ? existing.arrivalTime : null,
        toArrival: arrivalChanged ? data.arrivalTime : null,
        reason,
        changedById: user.id,
        changedByName: user.name,
      });

      await recordAudit({
        eventId,
        actorId: user.id,
        actorName: user.name,
        action: moved ? 'REASSIGN' : 'UPDATE',
        entity: 'ASSIGNMENT',
        entityId: existing.id,
        entityLabel: member.name,
        oldValues: {
          location: oldLocation,
          task: t.enums.task[existing.task as Task],
          arrival: existing.arrivalTime,
        },
        newValues: {
          location: newLocation,
          task: t.enums.task[data.task],
          arrival: data.arrivalTime,
        },
        reason,
        summary: moved
          ? `${member.name}: ${oldLocation} → ${newLocation}`
          : `${member.name} — ${t.enums.auditAction.UPDATE}`,
      });
    }

    // Keep the gate's own leader pointer in step with the assignment flag.
    await syncGateLeader(eventId, data.gateId ?? null, data.eventMemberId, data.isGateLeader ?? false);

    revalidateEvent(eventId);
    return ok();
  }

  const id = newId();
  await db.insert(assignments).values({
    id,
    eventId,
    eventMemberId: data.eventMemberId,
    gateId: data.gateId ?? null,
    workingPointId: data.workingPointId ?? null,
    task: data.task,
    arrivalTime: data.arrivalTime,
    shiftStart: data.shiftStart,
    shiftEnd: data.shiftEnd,
    isGateLeader: data.isGateLeader ?? false,
    notes: data.notes ?? null,
    status: 'ASSIGNED',
    createdById: user.id,
  });

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'ASSIGN',
    entity: 'ASSIGNMENT',
    entityId: id,
    entityLabel: member.name,
    newValues: {
      location: newLocation,
      task: t.enums.task[data.task],
      arrival: data.arrivalTime,
    },
    summary: `${member.name} → ${newLocation}`,
  });

  await syncGateLeader(eventId, data.gateId ?? null, data.eventMemberId, data.isGateLeader ?? false);

  revalidateEvent(eventId);
  return ok();
}

async function syncGateLeader(
  eventId: string,
  gateId: string | null,
  eventMemberId: string,
  isLeader: boolean,
) {
  if (!gateId) return;
  const gate = await db.query.gates.findFirst({ where: eq(gates.id, gateId) });
  if (!gate || gate.eventId !== eventId) return;

  if (isLeader) {
    if (gate.gateLeaderId !== eventMemberId) {
      await db
        .update(gates)
        .set({ gateLeaderId: eventMemberId, updatedAt: new Date() })
        .where(eq(gates.id, gateId));
      // Only one leader per gate.
      await db
        .update(assignments)
        .set({ isGateLeader: false })
        .where(
          and(
            eq(assignments.gateId, gateId),
            ne(assignments.eventMemberId, eventMemberId),
          ),
        );
    }
  } else if (gate.gateLeaderId === eventMemberId) {
    await db
      .update(gates)
      .set({ gateLeaderId: null, updatedAt: new Date() })
      .where(eq(gates.id, gateId));
  }
}

/** Cancels an assignment but keeps the row and its history (spec §48). */
export async function cancelAssignmentAction(
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

  const id = str(form, 'assignmentId');
  if (!id) return fail(t.errors.notFound);

  const row = await db
    .select({
      id: assignments.id,
      eventId: assignments.eventId,
      gateId: assignments.gateId,
      workingPointId: assignments.workingPointId,
      eventMemberId: assignments.eventMemberId,
      memberName: teamMembers.fullName,
    })
    .from(assignments)
    .innerJoin(eventMembers, eq(assignments.eventMemberId, eventMembers.id))
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(assignments.id, id))
    .get();

  if (!row || row.eventId !== eventId) return fail(t.errors.notFound);

  const location = await locationLabel(row.gateId, row.workingPointId);

  await db
    .update(assignments)
    .set({ status: 'CANCELLED', updatedById: user.id, updatedAt: new Date() })
    .where(eq(assignments.id, id));

  if (row.gateId) {
    await db
      .update(gates)
      .set({ gateLeaderId: null })
      .where(and(eq(gates.id, row.gateId), eq(gates.gateLeaderId, row.eventMemberId)));
  }

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'ASSIGNMENT',
    entityId: id,
    entityLabel: row.memberName,
    oldValues: { location, status: 'ASSIGNED' },
    newValues: { status: 'CANCELLED' },
    reason: str(form, 'reason'),
    summary: `${t.assignment.cancelAssignment}: ${row.memberName} — ${location}`,
  });

  revalidateEvent(eventId);
  return ok();
}

export async function confirmAssignmentAction(
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
  const id = str(form, 'assignmentId');
  if (!id) return fail(t.errors.notFound);

  await db
    .update(assignments)
    .set({ status: 'CONFIRMED', updatedAt: new Date() })
    .where(and(eq(assignments.id, id), eq(assignments.eventId, eventId)));

  revalidateEvent(eventId);
  return ok();
}
