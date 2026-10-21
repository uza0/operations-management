import 'server-only';

import { and, asc, eq, ne } from 'drizzle-orm';

import { db } from '@/db';
import {
  assignments,
  eventMembers,
  events,
  gates,
  mainGateDetails,
  mainGateMembers,
  teamMembers,
  workingPoints,
} from '@/db/schema';
import { TASKS, type Task } from '@/lib/constants';

/**
 * The main-gate detail: who stands at the venue's front entrance in the hours
 * before the hall itself opens.
 *
 * See the note on `mainGateDetails` in the schema for why this is not an
 * assignment. The short version: these people keep their real posts, and this
 * is an earlier shift laid on top, so nothing here is allowed to touch the
 * staffing arithmetic or the reassignment history.
 */

/** The two jobs that are always paired at a gate; others are still allowed. */
export const MAIN_GATE_DEFAULT_TASKS: Task[] = ['ELECTRONIC_SCANNING', 'WRISTBAND_FITTING'];

export type MainGatePerson = {
  id: string;
  eventMemberId: string;
  name: string;
  employeeCode: string;
  task: Task;
  /** Where this person is posted for the event proper — where they go after. */
  normalPlace: string | null;
};

export type MainGateCandidate = {
  eventMemberId: string;
  name: string;
  employeeCode: string;
  normalPlace: string | null;
  /** True when they are already on the detail. */
  picked: boolean;
};

export type MainGateData = {
  detail: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    notes: string | null;
  } | null;
  /** Grouped by task, in the order the tasks are listed. */
  groups: { task: Task; people: MainGatePerson[] }[];
  people: MainGatePerson[];
  candidates: MainGateCandidate[];
};

/** Where a member is posted for the event itself, by event member id. */
async function placesByMember(eventId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({
      eventMemberId: assignments.eventMemberId,
      gateName: gates.name,
      pointName: workingPoints.name,
    })
    .from(assignments)
    .leftJoin(gates, eq(assignments.gateId, gates.id))
    .leftJoin(workingPoints, eq(assignments.workingPointId, workingPoints.id))
    .where(and(eq(assignments.eventId, eventId), ne(assignments.status, 'CANCELLED')));

  const map = new Map<string, string>();
  for (const row of rows) {
    const place = row.gateName ?? row.pointName;
    if (place) map.set(row.eventMemberId, place);
  }
  return map;
}

export async function buildMainGate(eventId: string): Promise<MainGateData> {
  const detail = await db.query.mainGateDetails.findFirst({
    where: eq(mainGateDetails.eventId, eventId),
  });

  const [roster, places] = await Promise.all([
    db
      .select({
        eventMemberId: eventMembers.id,
        name: teamMembers.fullName,
        employeeCode: teamMembers.employeeCode,
        status: eventMembers.status,
      })
      .from(eventMembers)
      .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
      .where(eq(eventMembers.eventId, eventId)),
    placesByMember(eventId),
  ]);

  const active = roster.filter((row) => row.status !== 'CANCELLED');

  if (!detail) {
    return {
      detail: null,
      groups: [],
      people: [],
      candidates: active
        .map((row) => ({
          eventMemberId: row.eventMemberId,
          name: row.name,
          employeeCode: row.employeeCode,
          normalPlace: places.get(row.eventMemberId) ?? null,
          picked: false,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  const rows = await db
    .select({
      id: mainGateMembers.id,
      eventMemberId: mainGateMembers.eventMemberId,
      task: mainGateMembers.task,
      sortOrder: mainGateMembers.sortOrder,
      name: teamMembers.fullName,
      employeeCode: teamMembers.employeeCode,
    })
    .from(mainGateMembers)
    .innerJoin(eventMembers, eq(mainGateMembers.eventMemberId, eventMembers.id))
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(mainGateMembers.detailId, detail.id))
    .orderBy(asc(mainGateMembers.sortOrder));

  const people: MainGatePerson[] = rows.map((row) => ({
    id: row.id,
    eventMemberId: row.eventMemberId,
    name: row.name,
    employeeCode: row.employeeCode,
    task: row.task as Task,
    normalPlace: places.get(row.eventMemberId) ?? null,
  }));

  /*
   * The two usual jobs are always shown, empty or not, because an empty
   * scanning column is the thing a supervisor needs to notice. Any other job
   * someone has actually been put on is shown after them.
   */
  const used = [...new Set(people.map((person) => person.task))];
  const shown: Task[] = [
    ...MAIN_GATE_DEFAULT_TASKS,
    ...used.filter((task) => !MAIN_GATE_DEFAULT_TASKS.includes(task)),
  ];

  const onDetail = new Set(people.map((person) => person.eventMemberId));

  return {
    detail: {
      id: detail.id,
      name: detail.name,
      startTime: detail.startTime,
      endTime: detail.endTime,
      notes: detail.notes,
    },
    groups: shown.map((task) => ({
      task,
      people: people.filter((person) => person.task === task),
    })),
    people,
    candidates: active
      .map((row) => ({
        eventMemberId: row.eventMemberId,
        name: row.name,
        employeeCode: row.employeeCode,
        normalPlace: places.get(row.eventMemberId) ?? null,
        picked: onDetail.has(row.eventMemberId),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** One person's own line on the detail, for their personal page and message. */
export type MyMainGate = {
  name: string;
  startTime: string;
  endTime: string;
  task: Task;
  notes: string | null;
};

export async function mainGateForMember(
  eventId: string,
  eventMemberId: string,
): Promise<MyMainGate | null> {
  const row = await db
    .select({
      name: mainGateDetails.name,
      startTime: mainGateDetails.startTime,
      endTime: mainGateDetails.endTime,
      notes: mainGateDetails.notes,
      task: mainGateMembers.task,
    })
    .from(mainGateMembers)
    .innerJoin(mainGateDetails, eq(mainGateMembers.detailId, mainGateDetails.id))
    .where(
      and(
        eq(mainGateMembers.eventId, eventId),
        eq(mainGateMembers.eventMemberId, eventMemberId),
      ),
    )
    .get();

  if (!row) return null;
  // A task that no longer exists in the list would render as a blank label.
  const task = (TASKS as readonly string[]).includes(row.task)
    ? (row.task as Task)
    : ('OTHER' as Task);
  return { ...row, task };
}

/** Default hours for a new detail: the window the venue actually uses. */
export function suggestedHours(eventStart: string): { start: string; end: string } {
  const [h, m] = eventStart.split(':').map(Number);
  const minutes = (h || 0) * 60 + (m || 0);
  const clamp = (value: number) => Math.max(0, value);
  const asClock = (value: number) =>
    `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  // Four hours before the show until two hours before it — the window the
  // supervisor described, offered as a starting point and freely editable.
  return { start: asClock(clamp(minutes - 240)), end: asClock(clamp(minutes - 120)) };
}

export async function eventStartTime(eventId: string): Promise<string> {
  const row = await db
    .select({ startTime: events.startTime })
    .from(events)
    .where(eq(events.id, eventId))
    .get();
  return row?.startTime ?? '20:00';
}
