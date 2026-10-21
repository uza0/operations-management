import 'server-only';

import { and, eq, ne } from 'drizzle-orm';

import { db } from '@/db';
import {
  assignments,
  eventMembers,
  events,
  gates,
  teamMembers,
  venues,
  workingPoints,
} from '@/db/schema';
import { EVENT_ROLES, TASKS, type EventRole, type Task } from '@/lib/constants';
import { byName, compareNames } from '@/lib/sort';

/**
 * The distribution board.
 *
 * This is the supervisor's own way of working, made into a screen. Before any
 * of this existed he kept a sheet with a column per gate, split into the jobs
 * that gate needs — a scanning line, an information desk — and he moved names
 * into those columns until the sheet was full and the pile of unassigned names
 * was empty.
 *
 * So the board is a pool of names on one side and the gates on the other, and
 * the two numbers that matter are on top: how many are placed, and how many are
 * still waiting. Everything underneath is the same assignments table the rest of
 * the system already reads; the board is a way of filling it, not a second copy
 * of it.
 */

/** What a location is divided into when nobody has said otherwise. */
const DEFAULT_GATE_LANES: Task[] = ['ELECTRONIC_SCANNING', 'INFORMATION'];
const DEFAULT_POINT_LANES: Task[] = ['OTHER'];

/**
 * Lanes are stored as JSON text. Anything unreadable, empty, or naming a task
 * that no longer exists falls back to the default rather than rendering a
 * broken board — a location with no lanes cannot take anyone at all.
 */
export function parseLanes(raw: string | null, kind: 'GATE' | 'POINT'): Task[] {
  const fallback = kind === 'GATE' ? DEFAULT_GATE_LANES : DEFAULT_POINT_LANES;
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    const clean = parsed.filter(
      (value): value is Task => typeof value === 'string' && (TASKS as readonly string[]).includes(value),
    );
    // De-duplicate: the same lane twice would split one group in two.
    const unique = [...new Set(clean)];
    return unique.length > 0 ? unique : fallback;
  } catch {
    return fallback;
  }
}

export type BoardPerson = {
  eventMemberId: string;
  assignmentId: string | null;
  name: string;
  employeeCode: string;
  isReserve: boolean;
  isGateLeader: boolean;
  /** Null for an ordinary member — see event_members.eventRole. */
  eventRole: EventRole | null;
};

export type BoardLane = {
  /** "<locationId>:<TASK>" — what a drop target is addressed by. */
  key: string;
  task: Task;
  people: BoardPerson[];
};

export type BoardLocation = {
  id: string;
  kind: 'GATE' | 'POINT';
  name: string;
  type: string;
  requiredStaff: number;
  sortOrder: number;
  lanes: BoardLane[];
  placed: number;
};

export type BoardData = {
  event: {
    id: string;
    name: string;
    date: string;
    startTime: string;
    teamArrivalTime: string;
    teamDepartureTime: string | null;
    status: string;
    venueName: string | null;
    boardToken: string | null;
  };
  locations: BoardLocation[];
  /** Members of the event with no active assignment — the pile to be dealt. */
  pool: BoardPerson[];
  totals: { team: number; placed: number; left: number; required: number };
};

export async function buildBoard(eventId: string): Promise<BoardData | null> {
  const event = await db
    .select({
      id: events.id,
      name: events.name,
      date: events.date,
      startTime: events.startTime,
      teamArrivalTime: events.teamArrivalTime,
      teamDepartureTime: events.teamDepartureTime,
      status: events.status,
      boardToken: events.boardToken,
      venueName: venues.name,
    })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .where(eq(events.id, eventId))
    .get();
  if (!event) return null;

  const [gateRows, pointRows, memberRows] = await Promise.all([
    db.select().from(gates).where(eq(gates.eventId, eventId)).orderBy(gates.sortOrder),
    db
      .select()
      .from(workingPoints)
      .where(eq(workingPoints.eventId, eventId))
      .orderBy(workingPoints.sortOrder),
    db
      .select({
        eventMemberId: eventMembers.id,
        name: teamMembers.fullName,
        employeeCode: teamMembers.employeeCode,
        isReserve: eventMembers.isReserve,
        eventRole: eventMembers.eventRole,
        memberStatus: eventMembers.status,
        assignmentId: assignments.id,
        assignmentStatus: assignments.status,
        gateId: assignments.gateId,
        workingPointId: assignments.workingPointId,
        task: assignments.task,
        isGateLeader: assignments.isGateLeader,
      })
      .from(eventMembers)
      .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
      .leftJoin(
        assignments,
        and(
          eq(assignments.eventMemberId, eventMembers.id),
          ne(assignments.status, 'CANCELLED'),
        ),
      )
      .where(eq(eventMembers.eventId, eventId)),
  ]);

  const active = memberRows.filter((row) => row.memberStatus !== 'CANCELLED');

  const locations: BoardLocation[] = [
    ...gateRows.map((gate) => ({
      id: gate.id,
      kind: 'GATE' as const,
      name: gate.name,
      type: gate.type,
      requiredStaff: gate.requiredStaff,
      sortOrder: gate.sortOrder,
      lanes: parseLanes(gate.lanes, 'GATE').map((task) => ({
        key: `${gate.id}:${task}`,
        task,
        people: [] as BoardPerson[],
      })),
      placed: 0,
    })),
    ...pointRows.map((point) => ({
      id: point.id,
      kind: 'POINT' as const,
      name: point.name,
      type: point.type,
      requiredStaff: point.requiredStaff,
      sortOrder: point.sortOrder,
      lanes: parseLanes(point.lanes, 'POINT').map((task) => ({
        key: `${point.id}:${task}`,
        task,
        people: [] as BoardPerson[],
      })),
      placed: 0,
    })),
  ].sort((a, b) => a.sortOrder - b.sortOrder || compareNames(a.name, b.name));

  const byId = new Map(locations.map((l) => [l.id, l]));
  const pool: BoardPerson[] = [];

  for (const row of active) {
    const person: BoardPerson = {
      eventMemberId: row.eventMemberId,
      assignmentId: row.assignmentId,
      name: row.name,
      employeeCode: row.employeeCode,
      isReserve: row.isReserve,
      isGateLeader: row.isGateLeader ?? false,
      // A value written before a role was removed from the list is treated as
      // no role rather than rendering a label nobody can read.
      eventRole: (EVENT_ROLES as readonly string[]).includes(row.eventRole ?? '')
        ? (row.eventRole as EventRole)
        : null,
    };

    const locationId = row.gateId ?? row.workingPointId;
    const location = locationId ? byId.get(locationId) : undefined;
    if (!location || !row.task) {
      pool.push(person);
      continue;
    }

    /*
     * Someone whose task is not one of the location's lanes still belongs on
     * the board — dropping them would hide a real assignment. Their lane is
     * added on the spot so they appear where they actually are.
     */
    let lane = location.lanes.find((l) => l.task === row.task);
    if (!lane) {
      lane = { key: `${location.id}:${row.task}`, task: row.task as Task, people: [] };
      location.lanes.push(lane);
    }
    lane.people.push(person);
    location.placed += 1;
  }

  for (const location of locations) {
    for (const lane of location.lanes) {
      /*
       * Whoever runs the post is listed first — on the printed sheet the name
       * at the top of a gate is the one you go to, and alphabetical order
       * would bury him somewhere in the middle of his own gate.
       */
      lane.people.sort(
        (a, b) =>
          Number(Boolean(b.eventRole)) - Number(Boolean(a.eventRole)) ||
          compareNames(a.name, b.name),
      );
    }
  }
  pool.sort(byName);

  const placed = active.length - pool.length;
  return {
    event,
    locations,
    pool,
    totals: {
      team: active.length,
      placed,
      left: pool.length,
      required: locations.reduce((sum, l) => sum + l.requiredStaff, 0),
    },
  };
}

/** The same board, found by its public link instead of by event id. */
export async function boardByToken(token: string): Promise<BoardData | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const event = await db.query.events.findFirst({
    where: eq(events.boardToken, token),
  });
  if (!event) return null;
  return buildBoard(event.id);
}
