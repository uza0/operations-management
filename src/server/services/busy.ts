import 'server-only';

import { and, eq, inArray, ne } from 'drizzle-orm';

import { db } from '@/db';
import { eventMembers, events } from '@/db/schema';

type Shift = { date: string; teamArrivalTime: string; teamDepartureTime: string | null };

const DAY = 24 * 60;

/** Minutes since 1970-01-01 for a "YYYY-MM-DD" day plus "HH:mm" — only compared, never shown. */
function at(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d) / 60000 + h * 60 + min;
}

/** Shifts the day by n, keeping it a "YYYY-MM-DD" string. */
function shiftDay(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * The hours a team works an event, as [from, to). A departure at or before the
 * arrival runs past midnight. Without a departure the event is taken to fill the
 * rest of its day, so an event whose hours are not known yet still clashes with
 * anything later that day, as every event did before hours were compared.
 */
function window(e: Shift): [number, number] {
  const from = at(e.date, e.teamArrivalTime);
  if (!e.teamDepartureTime) return [from, at(e.date, '00:00') + DAY];
  let to = at(e.date, e.teamDepartureTime);
  if (to <= from) to += DAY;
  return [from, to];
}

/** Whether two events' team hours overlap. Back to back (one ends at 2, the next starts at 2) is not a clash. */
export function shiftsOverlap(a: Shift, b: Shift): boolean {
  const [a0, a1] = window(a);
  const [b0, b1] = window(b);
  return a0 < b1 && b0 < a1;
}

/**
 * Promoters already working another event whose team hours overlap this one.
 * One person cannot be at two venues at once, but two events on the same day
 * at different hours — morning and evening — can share people.
 */
export async function membersBusyDuring(event: Shift & { id: string }): Promise<Set<string>> {
  const days = [shiftDay(event.date, -1), event.date, shiftDay(event.date, 1)];
  const rows = await db
    .select({
      teamMemberId: eventMembers.teamMemberId,
      date: events.date,
      teamArrivalTime: events.teamArrivalTime,
      teamDepartureTime: events.teamDepartureTime,
    })
    .from(eventMembers)
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .where(
      and(
        inArray(events.date, days),
        ne(events.id, event.id),
        ne(eventMembers.status, 'CANCELLED'),
      ),
    );
  return new Set(rows.filter((r) => shiftsOverlap(event, r)).map((r) => r.teamMemberId));
}
