import 'server-only';

import { and, asc, desc, eq, isNotNull, ne } from 'drizzle-orm';

import { db } from '@/db';
import {
  assignments,
  attendance,
  eventMembers,
  events,
  gates,
  seatSetupDetails,
  seatSetupMembers,
  teamMembers,
  workingPoints,
} from '@/db/schema';
import { ARRIVAL_WINDOW_HOURS, seatStageFor, type SeatStage } from '@/lib/journey';
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
  /** His answer to this day's own invitation, and when he gave it. */
  confirmedAt: Date | null;
  declinedAt: Date | null;
  declineReason: string | null;
  notifiedAt: Date | null;
  /** The two halves of turning up: his sentence, then somebody else's. */
  reportedArrivalAt: Date | null;
  approvedAt: Date | null;
};

export type SeatSetupCandidate = {
  eventMemberId: string;
  name: string;
  employeeCode: string;
  normalPlace: string | null;
  picked: boolean;
};

export type SeatSetupShift = {
  id: string;
  status: 'PLANNING' | 'READY';
  date: string;
  startTime: string;
  endTime: string | null;
  notes: string | null;
  payAmount: number;
  people: SeatSetupPerson[];
};

export type SeatSetupData = {
  /**
   * Every chair day this event has, earliest first. A hall of six thousand
   * seats is not laid out in an afternoon, so the big events have two or
   * three — each its own day's work, its own crew and its own day's pay.
   */
  shifts: SeatSetupShift[];
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

  const details = await db
    .select()
    .from(seatSetupDetails)
    .where(eq(seatSetupDetails.eventId, eventId))
    .orderBy(asc(seatSetupDetails.date), asc(seatSetupDetails.startTime));

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

  const candidates = active
    .map((row) => ({
      eventMemberId: row.eventMemberId,
      name: row.name,
      employeeCode: row.employeeCode,
      normalPlace: places.get(row.eventMemberId) ?? null,
      picked: false,
    }))
    .sort(byName);

  if (details.length === 0) {
    return { shifts: [], candidates, lastCrew };
  }

  const rows = await db
    .select({
      id: seatSetupMembers.id,
      detailId: seatSetupMembers.detailId,
      eventMemberId: seatSetupMembers.eventMemberId,
      attended: seatSetupMembers.attended,
      checkInTime: seatSetupMembers.checkInTime,
      checkOutTime: seatSetupMembers.checkOutTime,
      notes: seatSetupMembers.notes,
      confirmedAt: seatSetupMembers.confirmedAt,
      declinedAt: seatSetupMembers.declinedAt,
      declineReason: seatSetupMembers.declineReason,
      notifiedAt: seatSetupMembers.notifiedAt,
      reportedArrivalAt: seatSetupMembers.reportedArrivalAt,
      approvedAt: seatSetupMembers.approvedAt,
      name: teamMembers.fullName,
      employeeCode: teamMembers.employeeCode,
    })
    .from(seatSetupMembers)
    .innerJoin(eventMembers, eq(seatSetupMembers.eventMemberId, eventMembers.id))
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(seatSetupMembers.eventId, eventId))
    .orderBy(asc(seatSetupMembers.sortOrder));

  const shifts: SeatSetupShift[] = details.map((detail) => ({
    id: detail.id,
    status: detail.status === 'READY' ? 'READY' : 'PLANNING',
    date: detail.date,
    startTime: detail.startTime,
    endTime: detail.endTime,
    notes: detail.notes,
    payAmount: detail.payAmount ?? SEAT_SETUP_PAY,
    people: rows
      .filter((row) => row.detailId === detail.id)
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
        confirmedAt: row.confirmedAt,
        declinedAt: row.declinedAt,
        declineReason: row.declineReason,
        notifiedAt: row.notifiedAt,
        reportedArrivalAt: row.reportedArrivalAt,
        approvedAt: row.approvedAt,
      }))
      .sort(byName),
  }));

  return { shifts, candidates, lastCrew };
}

/** The day before the event — what a new shift's date starts at. */
export function dayBefore(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type MySeatSetup = {
  /** The crew row itself: the thing his two buttons act on. */
  id: string;
  status: 'PLANNING' | 'READY';
  date: string;
  startTime: string;
  endTime: string | null;
  notes: string | null;
  /** What this day is worth to him, stated before he answers. */
  payAmount: number;
  confirmedAt: Date | null;
  declinedAt: Date | null;
  respondBy: Date | null;
  reportedArrivalAt: Date | null;
  approvedAt: Date | null;
  reportedDepartureAt: Date | null;
  checkInTime: string | null;
  attended: boolean;
  /** Where he is in this day, by the same rules as the night. */
  stage: SeatStage;
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
): Promise<MySeatSetup[]> {
  const rows = await db
    .select({
      id: seatSetupMembers.id,
      status: seatSetupDetails.status,
      date: seatSetupDetails.date,
      startTime: seatSetupDetails.startTime,
      endTime: seatSetupDetails.endTime,
      notes: seatSetupDetails.notes,
      payAmount: seatSetupDetails.payAmount,
      confirmedAt: seatSetupMembers.confirmedAt,
      declinedAt: seatSetupMembers.declinedAt,
      respondBy: seatSetupMembers.respondBy,
      reportedArrivalAt: seatSetupMembers.reportedArrivalAt,
      approvedAt: seatSetupMembers.approvedAt,
      reportedDepartureAt: seatSetupMembers.reportedDepartureAt,
      checkInTime: seatSetupMembers.checkInTime,
      attended: seatSetupMembers.attended,
    })
    .from(seatSetupMembers)
    .innerJoin(seatSetupDetails, eq(seatSetupMembers.detailId, seatSetupDetails.id))
    .where(
      and(
        eq(seatSetupMembers.eventId, eventId),
        eq(seatSetupMembers.eventMemberId, eventMemberId),
      ),
    )
    .orderBy(asc(seatSetupDetails.date));

  const now = new Date();
  return rows.map((row) => ({
    ...row,
    status: row.status === 'READY' ? 'READY' as const : 'PLANNING' as const,
    payAmount: row.payAmount ?? SEAT_SETUP_PAY,
    stage: seatStageFor({
      confirmedAt: row.confirmedAt,
      declinedAt: row.declinedAt,
      reportedArrivalAt: row.reportedArrivalAt,
      approvedAt: row.approvedAt,
      reportedDepartureAt: row.reportedDepartureAt,
      attended: row.attended,
      date: row.date,
      startTime: row.startTime,
      arrivalWindowHours: ARRIVAL_WINDOW_HOURS,
      now,
    }),
  }));
}

/**
 * A restricted chair-only view for a promoter invited before the event is
 * published. It intentionally returns no venue, event time, event status,
 * team list, map, or assignment data.
 */
export async function seatSetupInvitationByToken(token: string) {
  if (!/^[a-f0-9]{32}$/i.test(token)) return null;

  const membership = await db
    .select({
      id: eventMembers.id,
      eventId: events.id,
      memberName: teamMembers.fullName,
      eventName: events.name,
      eventStatus: events.status,
      memberStatus: eventMembers.status,
      tokenExpiresAt: eventMembers.tokenExpiresAt,
    })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .where(eq(eventMembers.token, token))
    .get();

  if (
    !membership ||
    membership.memberStatus === 'CANCELLED' ||
    (membership.tokenExpiresAt && membership.tokenExpiresAt.getTime() < Date.now())
  ) {
    return null;
  }

  const rows = await db
    .select({
      id: seatSetupMembers.id,
      date: seatSetupDetails.date,
      startTime: seatSetupDetails.startTime,
      endTime: seatSetupDetails.endTime,
      notes: seatSetupDetails.notes,
      payAmount: seatSetupDetails.payAmount,
      confirmedAt: seatSetupMembers.confirmedAt,
      declinedAt: seatSetupMembers.declinedAt,
      respondBy: seatSetupMembers.respondBy,
      reportedArrivalAt: seatSetupMembers.reportedArrivalAt,
      approvedAt: seatSetupMembers.approvedAt,
      reportedDepartureAt: seatSetupMembers.reportedDepartureAt,
      checkInTime: seatSetupMembers.checkInTime,
      attended: seatSetupMembers.attended,
    })
    .from(seatSetupMembers)
    .innerJoin(seatSetupDetails, eq(seatSetupMembers.detailId, seatSetupDetails.id))
    .where(
      and(
        eq(seatSetupMembers.eventMemberId, membership.id),
        eq(seatSetupMembers.eventId, membership.eventId),
        eq(seatSetupDetails.status, 'READY'),
        isNotNull(seatSetupMembers.notifiedAt),
      ),
    )
    .orderBy(asc(seatSetupDetails.date), asc(seatSetupDetails.startTime));

  const now = new Date();
  return {
    memberName: membership.memberName,
    eventName: membership.eventName,
    eventStatus: membership.eventStatus,
    shifts: rows.map((row) => ({
      ...row,
      payAmount: row.payAmount ?? SEAT_SETUP_PAY,
      stage: seatStageFor({
        confirmedAt: row.confirmedAt,
        declinedAt: row.declinedAt,
        reportedArrivalAt: row.reportedArrivalAt,
        approvedAt: row.approvedAt,
        reportedDepartureAt: row.reportedDepartureAt,
        attended: row.attended,
        date: row.date,
        startTime: row.startTime,
        arrivalWindowHours: ARRIVAL_WINDOW_HOURS,
        now,
      }),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* what nobody decided                                                        */
/* -------------------------------------------------------------------------- */

export type Unmarked = {
  /** On the night itself: nobody said he came and nobody said he did not. */
  event: string[];
  /** On the chair shift the day before: no approval, no refusal. */
  seats: string[];
};

/**
 * Who has no attendance decision against their name on this event.
 *
 * Closing an event is the moment every undecided line turns into a zero. A man
 * marked neither present nor absent earns nothing, and so does a chair shift
 * nobody approved — quietly, with no message to anybody, and the first anyone
 * hears of it is a promoter asking why his week is short.
 *
 * The chair shift is where this actually happens. It runs the afternoon before
 * the match, the people drift in, the hall gets ready, and nobody thinks to
 * open a screen and confirm anything. The event night has a routine around it;
 * that afternoon does not.
 *
 * So this is read once, at the moment of closing, and the names are put in
 * front of whoever is closing it. It decides nothing by itself: he goes back
 * and marks them, or he closes anyway and the zeros are his to mean.
 */
export async function unmarkedAttendance(eventId: string): Promise<Unmarked> {
  const [nightRows, seatRows] = await Promise.all([
    db
      .select({ name: teamMembers.fullName, status: attendance.status })
      .from(eventMembers)
      .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
      .leftJoin(attendance, eq(attendance.eventMemberId, eventMembers.id))
      .where(and(eq(eventMembers.eventId, eventId), ne(eventMembers.status, 'CANCELLED'))),
    db
      .select({
        name: teamMembers.fullName,
        attended: seatSetupMembers.attended,
        declinedAt: seatSetupMembers.declinedAt,
      })
      .from(seatSetupMembers)
      .innerJoin(eventMembers, eq(seatSetupMembers.eventMemberId, eventMembers.id))
      .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
      .where(eq(seatSetupMembers.eventId, eventId)),
  ]);

  /* A refusal is a decision; only silence counts here. */
  return {
    event: nightRows
      .filter((row) => !row.status || row.status === 'PENDING')
      .map((row) => row.name),
    seats: seatRows
      .filter((row) => !row.attended && !row.declinedAt)
      .map((row) => row.name),
  };
}
