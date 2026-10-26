import 'server-only';

import { and, asc, desc, eq, ne } from 'drizzle-orm';

import { db } from '@/db';
import {
  assignments,
  eventMembers,
  events,
  gates,
  seatSetupDetails,
  seatSetupMembers,
  teamMembers,
  workingPoints,
} from '@/db/schema';
import { SEAT_SETUP_PAY } from '@/lib/money';
import { byName } from '@/lib/sort';

/**
 * The crew that sets out the chairs the day before.
 *
 * Deliberately shaped like the main-gate detail and not like an assignment:
 * these people keep their posts for the event itself, and this is a separate
 * shift on a separate day laid beside it. Nothing here touches the staffing
 * arithmetic, the board, or the reassignment history.
 *
 * The one thing it does touch is money, and it touches it in one direction:
 * a flat rate per head, added to whatever the person earns on the night.
 */

export type SeatSetupPerson = {
  id: string;
  eventMemberId: string;
  name: string;
  employeeCode: string;
  attended: boolean;
  checkInTime: string | null;
  checkOutTime: string | null;
  notes: string | null;
  /** Where they stand for the event proper — useful context, not a rule. */
  normalPlace: string | null;
};

export type SeatSetupCandidate = {
  eventMemberId: string;
  name: string;
  employeeCode: string;
  normalPlace: string | null;
  picked: boolean;
};

export type SeatSetupData = {
  detail: {
    id: string;
    date: string;
    startTime: string;
    endTime: string | null;
    notes: string | null;
    payAmount: number;
  } | null;
  people: SeatSetupPerson[];
  candidates: SeatSetupCandidate[];
  /**
   * The crew from the last event at this venue that had one, so the same
   * dozen names do not have to be found again every month. Empty when there
   * is no such event, or when none of those people are on this one.
   */
  lastCrew: { eventName: string; eventDate: string; eventMemberIds: string[] };
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

/**
 * The people who did this at the same venue last time, translated into THIS
 * event's membership ids.
 *
 * Matching is by person, not by membership: a membership belongs to one
 * event, so the names are carried across and only those who are already on
 * this event come back. Somebody who did the chairs last month but is not on
 * this event is not silently added to it.
 */
async function lastCrewFor(
  eventId: string,
  venueId: string,
  date: string,
): Promise<SeatSetupData['lastCrew']> {
  const previous = await db
    .select({ id: events.id, name: events.name, date: events.date })
    .from(events)
    .innerJoin(seatSetupDetails, eq(seatSetupDetails.eventId, events.id))
    .where(and(eq(events.venueId, venueId), ne(events.id, eventId)))
    .orderBy(desc(events.date))
    .limit(5);

  const earlier = previous.find((row) => row.date <= date) ?? previous[0];
  if (!earlier) return { eventName: '', eventDate: '', eventMemberIds: [] };

  const crew = await db
    .select({ teamMemberId: eventMembers.teamMemberId })
    .from(seatSetupMembers)
    .innerJoin(eventMembers, eq(seatSetupMembers.eventMemberId, eventMembers.id))
    .where(eq(seatSetupMembers.eventId, earlier.id));

  if (crew.length === 0) {
    return { eventName: earlier.name, eventDate: earlier.date, eventMemberIds: [] };
  }

  const wanted = new Set(crew.map((row) => row.teamMemberId));
  const here = await db
    .select({ id: eventMembers.id, teamMemberId: eventMembers.teamMemberId })
    .from(eventMembers)
    .where(and(eq(eventMembers.eventId, eventId), ne(eventMembers.status, 'CANCELLED')));

  return {
    eventName: earlier.name,
    eventDate: earlier.date,
    eventMemberIds: here.filter((row) => wanted.has(row.teamMemberId)).map((row) => row.id),
  };
}

export async function buildSeatSetup(eventId: string): Promise<SeatSetupData> {
  const event = await db
    .select({ venueId: events.venueId, date: events.date })
    .from(events)
    .where(eq(events.id, eventId))
    .get();

  const detail = await db.query.seatSetupDetails.findFirst({
    where: eq(seatSetupDetails.eventId, eventId),
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
  const lastCrew = event
    ? await lastCrewFor(eventId, event.venueId, event.date)
    : { eventName: '', eventDate: '', eventMemberIds: [] };

  if (!detail) {
    return {
      detail: null,
      people: [],
      candidates: active
        .map((row) => ({
          eventMemberId: row.eventMemberId,
          name: row.name,
          employeeCode: row.employeeCode,
          normalPlace: places.get(row.eventMemberId) ?? null,
          picked: false,
        }))
        .sort(byName),
      lastCrew,
    };
  }

  const rows = await db
    .select({
      id: seatSetupMembers.id,
      eventMemberId: seatSetupMembers.eventMemberId,
      attended: seatSetupMembers.attended,
      checkInTime: seatSetupMembers.checkInTime,
      checkOutTime: seatSetupMembers.checkOutTime,
      notes: seatSetupMembers.notes,
      sortOrder: seatSetupMembers.sortOrder,
      name: teamMembers.fullName,
      employeeCode: teamMembers.employeeCode,
    })
    .from(seatSetupMembers)
    .innerJoin(eventMembers, eq(seatSetupMembers.eventMemberId, eventMembers.id))
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(seatSetupMembers.detailId, detail.id))
    .orderBy(asc(seatSetupMembers.sortOrder));

  const people: SeatSetupPerson[] = rows
    .map((row) => ({
      id: row.id,
      eventMemberId: row.eventMemberId,
      name: row.name,
      employeeCode: row.employeeCode,
      attended: row.attended,
      checkInTime: row.checkInTime,
      checkOutTime: row.checkOutTime,
      notes: row.notes,
      normalPlace: places.get(row.eventMemberId) ?? null,
    }))
    .sort(byName);

  const picked = new Set(people.map((p) => p.eventMemberId));

  return {
    detail: {
      id: detail.id,
      date: detail.date,
      startTime: detail.startTime,
      endTime: detail.endTime,
      notes: detail.notes,
      payAmount: detail.payAmount ?? SEAT_SETUP_PAY,
    },
    people,
    candidates: active
      .map((row) => ({
        eventMemberId: row.eventMemberId,
        name: row.name,
        employeeCode: row.employeeCode,
        normalPlace: places.get(row.eventMemberId) ?? null,
        picked: picked.has(row.eventMemberId),
      }))
      .sort(byName),
    lastCrew,
  };
}

/** The day before the event — what the date field starts at. */
export function dayBefore(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type MySeatSetup = {
  date: string;
  startTime: string;
  endTime: string | null;
  notes: string | null;
};

/**
 * This person's chair-setting shift, for their own page.
 *
 * Shown whatever the event's own state: it happens the day before, so by the
 * time the board is published and the gates open it is already behind them —
 * and before that it is the only thing on their page with a date on it.
 */
export async function seatSetupForMember(
  eventId: string,
  eventMemberId: string,
): Promise<MySeatSetup | null> {
  const row = await db
    .select({
      date: seatSetupDetails.date,
      startTime: seatSetupDetails.startTime,
      endTime: seatSetupDetails.endTime,
      notes: seatSetupDetails.notes,
    })
    .from(seatSetupMembers)
    .innerJoin(seatSetupDetails, eq(seatSetupMembers.detailId, seatSetupDetails.id))
    .where(
      and(
        eq(seatSetupMembers.eventId, eventId),
        eq(seatSetupMembers.eventMemberId, eventMemberId),
      ),
    )
    .get();

  return row ?? null;
}
