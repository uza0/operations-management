import 'server-only';

import { and, eq, ne } from 'drizzle-orm';

import { db } from '@/db';
import {
  assignments,
  eventMembers,
  gates,
  teamMembers,
  workingPoints,
} from '@/db/schema';
import { rangesOverlap } from '@/lib/time';

export type AssignmentRow = {
  id: string;
  eventMemberId: string;
  memberName: string;
  employeeCode: string;
  isReserve: boolean;
  gateId: string | null;
  workingPointId: string | null;
  locationName: string;
  locationKind: 'GATE' | 'WORKING_POINT';
  task: string;
  arrivalTime: string;
  shiftStart: string;
  shiftEnd: string;
  isGateLeader: boolean;
  status: string;
  notes: string | null;
  updatedAt: Date;
};

/** One query for the whole assignment board — list view, map view and report. */
export async function listAssignments(eventId: string): Promise<AssignmentRow[]> {
  const rows = await db
    .select({
      id: assignments.id,
      eventMemberId: assignments.eventMemberId,
      memberName: teamMembers.fullName,
      employeeCode: teamMembers.employeeCode,
      isReserve: eventMembers.isReserve,
      gateId: assignments.gateId,
      workingPointId: assignments.workingPointId,
      gateName: gates.name,
      workingPointName: workingPoints.name,
      task: assignments.task,
      arrivalTime: assignments.arrivalTime,
      shiftStart: assignments.shiftStart,
      shiftEnd: assignments.shiftEnd,
      isGateLeader: assignments.isGateLeader,
      status: assignments.status,
      notes: assignments.notes,
      updatedAt: assignments.updatedAt,
    })
    .from(assignments)
    .innerJoin(eventMembers, eq(assignments.eventMemberId, eventMembers.id))
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .leftJoin(gates, eq(assignments.gateId, gates.id))
    .leftJoin(workingPoints, eq(assignments.workingPointId, workingPoints.id))
    .where(eq(assignments.eventId, eventId));

  return rows
    .map((row) => ({
      id: row.id,
      eventMemberId: row.eventMemberId,
      memberName: row.memberName,
      employeeCode: row.employeeCode,
      isReserve: row.isReserve,
      gateId: row.gateId,
      workingPointId: row.workingPointId,
      locationName: row.gateName ?? row.workingPointName ?? '—',
      locationKind: (row.gateId ? 'GATE' : 'WORKING_POINT') as 'GATE' | 'WORKING_POINT',
      task: row.task,
      arrivalTime: row.arrivalTime,
      shiftStart: row.shiftStart,
      shiftEnd: row.shiftEnd,
      isGateLeader: row.isGateLeader,
      status: row.status,
      notes: row.notes,
      updatedAt: row.updatedAt,
    }))
    .sort(
      (a, b) =>
        a.locationName.localeCompare(b.locationName) ||
        Number(b.isGateLeader) - Number(a.isGateLeader) ||
        a.memberName.localeCompare(b.memberName),
    );
}

export type Conflict = {
  assignmentId: string;
  locationName: string;
  shiftStart: string;
  shiftEnd: string;
};

/**
 * Overlap detection (spec §14). A member on Gate 2 from 16:00–19:00 cannot
 * also be on Gate 6 from 17:00–20:00. Cancelled assignments are ignored, and
 * a shift that ends exactly when another starts is a handover, not a clash.
 */
export async function findScheduleConflict(
  eventId: string,
  eventMemberId: string,
  shiftStart: string,
  shiftEnd: string,
  excludeAssignmentId?: string,
): Promise<Conflict | null> {
  const rows = await db
    .select({
      id: assignments.id,
      shiftStart: assignments.shiftStart,
      shiftEnd: assignments.shiftEnd,
      gateName: gates.name,
      workingPointName: workingPoints.name,
    })
    .from(assignments)
    .leftJoin(gates, eq(assignments.gateId, gates.id))
    .leftJoin(workingPoints, eq(assignments.workingPointId, workingPoints.id))
    .where(
      and(
        eq(assignments.eventId, eventId),
        eq(assignments.eventMemberId, eventMemberId),
        ne(assignments.status, 'CANCELLED'),
      ),
    );

  for (const row of rows) {
    if (excludeAssignmentId && row.id === excludeAssignmentId) continue;
    if (rangesOverlap(shiftStart, shiftEnd, row.shiftStart, row.shiftEnd)) {
      return {
        assignmentId: row.id,
        locationName: row.gateName ?? row.workingPointName ?? '—',
        shiftStart: row.shiftStart,
        shiftEnd: row.shiftEnd,
      };
    }
  }
  return null;
}

/** Human-readable location name, used in change history and audit summaries. */
export async function locationLabel(
  gateId: string | null,
  workingPointId: string | null,
): Promise<string> {
  if (gateId) {
    const gate = await db.query.gates.findFirst({ where: eq(gates.id, gateId) });
    return gate?.name ?? '—';
  }
  if (workingPointId) {
    const point = await db.query.workingPoints.findFirst({
      where: eq(workingPoints.id, workingPointId),
    });
    return point?.name ?? '—';
  }
  return '—';
}

/** Event members with no active assignment — the pool a leader assigns from. */
export async function listAssignableMembers(eventId: string) {
  const members = await db
    .select({
      id: eventMembers.id,
      name: teamMembers.fullName,
      employeeCode: teamMembers.employeeCode,
      isReserve: eventMembers.isReserve,
      status: eventMembers.status,
    })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(eventMembers.eventId, eventId));

  const active = await db
    .select({ eventMemberId: assignments.eventMemberId })
    .from(assignments)
    .where(and(eq(assignments.eventId, eventId), ne(assignments.status, 'CANCELLED')));

  const assigned = new Set(active.map((a) => a.eventMemberId));

  return members
    .filter((m) => m.status !== 'CANCELLED')
    .map((m) => ({ ...m, assigned: assigned.has(m.id) }))
    .sort(
      (a, b) =>
        Number(a.assigned) - Number(b.assigned) ||
        Number(a.isReserve) - Number(b.isReserve) ||
        a.name.localeCompare(b.name),
    );
}
