import 'server-only';

import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventMembers, events, teamMembers, venues } from '@/db/schema';

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
    })
    .from(eventMembers)
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .innerJoin(venues, eq(events.venueId, venues.id))
    .where(eq(eventMembers.teamMemberId, teamMemberId))
    .orderBy(desc(events.date));

  /*
   * Three groups, in the order a man actually wants them: what is happening
   * right now, then what is coming, then what is over. A cancelled membership
   * is dropped rather than shown greyed out — he is not on that event, and a
   * line saying so is one more thing to read at a gate.
   */
  const live = [];
  const upcoming = [];
  const past = [];

  for (const row of rows) {
    if (row.status === 'CANCELLED') continue;
    if (row.eventStatus === 'LIVE') live.push(row);
    else if (row.eventStatus === 'COMPLETED' || row.eventStatus === 'ARCHIVED') past.push(row);
    else upcoming.push(row);
  }

  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  return { person, live, upcoming, past };
}

export type MemberHome = NonNullable<Awaited<ReturnType<typeof getMemberHome>>>;
