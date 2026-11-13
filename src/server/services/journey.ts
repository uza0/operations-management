import 'server-only';

import { and, eq, ne } from 'drizzle-orm';

import { db } from '@/db';
import { assignments, attendance, eventMembers, events, teamMembers } from '@/db/schema';
import { isOverdue, venueMoment } from '@/lib/journey';
import { byName } from '@/lib/sort';

/**
 * The invitation board: who answered, who has not, and who has run out of
 * time to.
 *
 * Four lists rather than a column of statuses, because they are four
 * different jobs. "Confirmed" needs nothing. "Waiting" needs patience. "Past
 * the deadline" needs a phone call. "Declined" needs a replacement — and the
 * difference between the last two is the whole reason the deadline passing
 * does not cancel anybody: silence is not an answer, and the system does not
 * get to decide what it meant.
 */
export type InvitationRow = {
  eventMemberId: string;
  name: string;
  phone: string | null;
  employeeCode: string;
  isReserve: boolean;
  notifiedAt: Date | null;
  respondBy: Date | null;
  confirmedAt: Date | null;
  declinedAt: Date | null;
  declineReason: string | null;
  /** No deadline could be set: the invitation went out too close to the day. */
  urgent: boolean;
  overdue: boolean;
};

export type InvitationBoard = {
  confirmed: InvitationRow[];
  waiting: InvitationRow[];
  overdue: InvitationRow[];
  declined: InvitationRow[];
  /** Not sent a link yet — they cannot be waiting for anything. */
  unsent: InvitationRow[];
};

export async function buildInvitationBoard(eventId: string): Promise<InvitationBoard> {
  const rows = await db
    .select({
      eventMemberId: eventMembers.id,
      name: teamMembers.fullName,
      phone: teamMembers.phone,
      employeeCode: teamMembers.employeeCode,
      isReserve: eventMembers.isReserve,
      status: eventMembers.status,
      notifiedAt: eventMembers.notifiedAt,
      respondBy: eventMembers.respondBy,
      confirmedAt: eventMembers.confirmedAt,
      declinedAt: eventMembers.declinedAt,
      declineReason: eventMembers.declineReason,
    })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(eventMembers.eventId, eventId));

  const now = new Date();
  const board: InvitationBoard = {
    confirmed: [],
    waiting: [],
    overdue: [],
    declined: [],
    unsent: [],
  };

  for (const row of rows) {
    const entry: InvitationRow = {
      eventMemberId: row.eventMemberId,
      name: row.name,
      phone: row.phone,
      employeeCode: row.employeeCode,
      isReserve: row.isReserve,
      notifiedAt: row.notifiedAt,
      respondBy: row.respondBy,
      confirmedAt: row.confirmedAt,
      declinedAt: row.declinedAt,
      declineReason: row.declineReason,
      urgent: row.notifiedAt !== null && row.respondBy === null,
      overdue: isOverdue({
        respondBy: row.respondBy,
        confirmedAt: row.confirmedAt,
        declinedAt: row.declinedAt,
        now,
      }),
    };

    if (row.declinedAt || row.status === 'CANCELLED') board.declined.push(entry);
    else if (row.confirmedAt) board.confirmed.push(entry);
    else if (!row.notifiedAt) board.unsent.push(entry);
    else if (entry.overdue || entry.urgent) board.overdue.push(entry);
    else board.waiting.push(entry);
  }

  for (const list of Object.values(board)) list.sort(byName);
  return board;
}

/**
 * Event day: who says they are here and has not been confirmed, and who has
 * not said anything.
 *
 * Ordered by what a gate leader does with it at five o'clock — confirm the
 * ones in front of him first, then work down the list of people who have not
 * turned up.
 */
export type ArrivalRow = {
  eventMemberId: string;
  name: string;
  phone: string | null;
  locationName: string | null;
  reportedArrivalAt: Date | null;
  checkInTime: string | null;
  approvedAt: Date | null;
  status: string;
  /** Minutes before (negative) or after (positive) the team was due. */
  minutesOff: number | null;
};

export async function buildArrivals(eventId: string, gateId: string | null = null): Promise<{
  pending: ArrivalRow[];
  approved: ArrivalRow[];
  missing: ArrivalRow[];
  dueAt: string;
}> {
  const event = await db
    .select({ date: events.date, arrival: events.teamArrivalTime })
    .from(events)
    .where(eq(events.id, eventId))
    .get();

  const rows = await db
    .select({
      eventMemberId: eventMembers.id,
      name: teamMembers.fullName,
      phone: teamMembers.phone,
      confirmedAt: eventMembers.confirmedAt,
      reportedArrivalAt: attendance.reportedArrivalAt,
      checkInTime: attendance.checkInTime,
      approvedAt: attendance.approvedAt,
      status: attendance.status,
      gateId: assignments.gateId,
    })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .leftJoin(attendance, eq(attendance.eventMemberId, eventMembers.id))
    .leftJoin(
      assignments,
      and(
        eq(assignments.eventMemberId, eventMembers.id),
        ne(assignments.status, 'CANCELLED'),
      ),
    )
    .where(
      and(eq(eventMembers.eventId, eventId), ne(eventMembers.status, 'CANCELLED')),
    );

  const due = event ? venueMoment(event.date, event.arrival) : null;

  const pending: ArrivalRow[] = [];
  const approved: ArrivalRow[] = [];
  const missing: ArrivalRow[] = [];

  const scopedRows = gateId ? rows.filter((row) => row.gateId === gateId) : rows;
  const uniqueRows = [...new Map(scopedRows.map((row) => [row.eventMemberId, row])).values()];

  for (const row of uniqueRows) {
    const entry: ArrivalRow = {
      eventMemberId: row.eventMemberId,
      name: row.name,
      phone: row.phone,
      locationName: null,
      reportedArrivalAt: row.reportedArrivalAt,
      checkInTime: row.checkInTime,
      approvedAt: row.approvedAt,
      status: row.status ?? 'PENDING',
      minutesOff:
        row.reportedArrivalAt && due
          ? Math.round((row.reportedArrivalAt.getTime() - due.getTime()) / 60000)
          : null,
    };

    if (row.approvedAt) approved.push(entry);
    else if (row.reportedArrivalAt) pending.push(entry);
    else missing.push(entry);
  }

  /* Earliest claim first: the queue at the desk is in that order too. */
  pending.sort(
    (a, b) => (a.reportedArrivalAt?.getTime() ?? 0) - (b.reportedArrivalAt?.getTime() ?? 0),
  );
  approved.sort(byName);
  missing.sort(byName);

  return { pending, approved, missing, dueAt: event?.arrival ?? '' };
}
