import 'server-only';

import { and, asc, desc, eq, isNotNull, ne } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventMembers,
  events,
  seatSetupDetails,
  seatSetupMembers,
  teamMembers,
  venues,
} from '@/db/schema';
import { ARRIVAL_WINDOW_HOURS, seatStageFor } from '@/lib/journey';
import { SEAT_SETUP_PAY } from '@/lib/money';

/**
 * Everything a promoter's own page needs: himself, and his events.
 *
 * It takes a team member id read from the session, never a token out of the
 * address bar, which is the whole point of the change — and it only ever asks
 * for rows belonging to that one id, so there is nothing here that could
 * answer a question about anybody else.
 */
export async function getMemberHome(teamMemberId: string) {
  const person = await db
    .select({
      id: teamMembers.id,
      name: teamMembers.fullName,
      cardNumber: teamMembers.cardNumber,
      photoUrl: teamMembers.photoUrl,
      pendingPhotoUrl: teamMembers.pendingPhotoUrl,
      salaried: teamMembers.salaried,
    })
    .from(teamMembers)
    .where(eq(teamMembers.id, teamMemberId))
    .get();

  if (!person) return null;

  const rows = await db
    .select({
      token: eventMembers.token,
      status: eventMembers.status,
      eventId: events.id,
      name: events.name,
      type: events.type,
      date: events.date,
      startTime: events.startTime,
      teamArrivalTime: events.teamArrivalTime,
      eventStatus: events.status,
      venue: venues.name,
      /*
       * Whether this night's wage has already gone out in a handover.
       *
       * He is told which evenings he has been paid for and which are still
       * coming, on the list itself. The balance above already gives him two
       * totals; what it cannot tell him is which of the names below each one
       * is made of — and that is the question he actually asks the leader.
       */
      payoutId: eventMembers.payoutId,
    })
    .from(eventMembers)
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .innerJoin(venues, eq(events.venueId, venues.id))
    .where(eq(eventMembers.teamMemberId, teamMemberId))
    .orderBy(desc(events.date));

  // A chair setup invitation is a separate piece of work. While its event is
  // still a draft, show only the setup day and its event name on the promoter
  // home page; the event card itself stays hidden until the event is ready.
  const seatInvitations = await db
    .select({
      token: eventMembers.token,
      eventName: events.name,
      shiftId: seatSetupDetails.id,
      date: seatSetupDetails.date,
      startTime: seatSetupDetails.startTime,
      endTime: seatSetupDetails.endTime,
      notes: seatSetupDetails.notes,
      payAmount: seatSetupDetails.payAmount,
      seatMemberId: seatSetupMembers.id,
      status: seatSetupDetails.status,
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
    .innerJoin(eventMembers, eq(seatSetupMembers.eventMemberId, eventMembers.id))
    .innerJoin(seatSetupDetails, eq(seatSetupMembers.detailId, seatSetupDetails.id))
    .innerJoin(events, eq(seatSetupMembers.eventId, events.id))
    .where(
      and(
        eq(eventMembers.teamMemberId, teamMemberId),
        ne(eventMembers.status, 'CANCELLED'),
        eq(events.status, 'DRAFT'),
        eq(seatSetupDetails.status, 'READY'),
        isNotNull(seatSetupMembers.notifiedAt),
      ),
    )
    .orderBy(asc(seatSetupDetails.date), asc(seatSetupDetails.startTime));

  /*
   * Three groups, in the order a man actually wants them: what is happening
   * right now, then what is coming, then what is over. A cancelled membership
   * is dropped rather than shown greyed out — he is not on that event, and a
   * line saying so is one more thing to read at a gate.
   *
   * A draft is dropped too, and for a stronger reason. A draft is an evening
   * somebody is still building: the date moves, the gates are not decided,
   * half the crew on it will be taken off again. A promoter who sees one puts
   * it in his week and arranges his life around it, and the first he hears
   * that it was never real is when it quietly disappears. It becomes his
   * business the moment it stops being a draft.
   */
  const live = [];
  const upcoming = [];
  const past = [];

  for (const raw of rows) {
    if (raw.status === 'CANCELLED') continue;
    if (raw.eventStatus === 'DRAFT') continue;
    /* The id itself is the office's business; he only needs the fact. */
    const { payoutId, ...rest } = raw;
    const row = { ...rest, paid: payoutId !== null };
    if (row.eventStatus === 'LIVE') live.push(row);
    else if (row.eventStatus === 'COMPLETED' || row.eventStatus === 'ARCHIVED') past.push(row);
    else upcoming.push(row);
  }

  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  const now = new Date();
  const readySeatInvitations = seatInvitations.map((row) => ({
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
  }));

  return { person, live, upcoming, past, seatInvitations: readySeatInvitations };
}

export type MemberHome = NonNullable<Awaited<ReturnType<typeof getMemberHome>>>;
