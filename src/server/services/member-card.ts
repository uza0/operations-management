import 'server-only';

import { and, asc, eq, gte, inArray, isNotNull, isNull, ne, or } from 'drizzle-orm';

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
  venues,
  workingPoints,
} from '@/db/schema';
import { todayISO } from '@/lib/time';

/**
 * What a promoter's share cards say about them — only things the system
 * actually knows, counted the same way their own attendance page counts them:
 * a night is theirs once it is over and they were marked present or late.
 *
 * Nothing here is money, a phone number or a card number: these cards are
 * made to be posted publicly.
 */
export type MemberCardStats = {
  name: string;
  initials: string;
  code: string;
  photoUrl: string | null;
  /** Their most frequent task, as the leaders wrote it; null before any. */
  role: string | null;
  events: number;
  venues: number;
  /** Year of their first worked night, else the year they joined. */
  since: string;
  /** Whole hours between recorded arrival and departure, nights with both. */
  hours: number;
  chairDays: number;
  favouriteVenue: { name: string; count: number } | null;
  /** The place they were posted most, for the season title. */
  topPost: string | null;
  firstDate: string | null;
  lastDate: string | null;
  /** Newest first. */
  stamps: { name: string; date: string }[];
  last: { name: string; date: string; venue: string; post: string | null } | null;
  /**
   * The next event he is on and has been told about — the one a "see you
   * there" card announces — or, with nothing ahead, the last one he worked
   * (past: true), so the card says "I was there" instead. Only once the briefing reached him (or he
   * confirmed), never a reserve place or one he declined: the card says
   * where he will be, so it must be somewhere he has actually been asked.
   */
  next: { name: string; date: string; startTime: string; venue: string; type: string; past: boolean } | null;
};

const WORKED = ['PRESENT', 'LATE'];
const CLOSED = ['COMPLETED', 'ARCHIVED'];

/** "Majid Almuhandis | Be Event | 11/20" → "Majid Almuhandis". */
export function shortEventName(name: string): string {
  const head = name.split('|')[0].split(/\s[—–-]\s/)[0];
  const clean = head.replace(/\s+\d{1,2}[\\/]\d{1,2}\s*$/, '').trim() || name.trim();
  return clean.length > 26 ? `${clean.slice(0, 25).trimEnd()}…` : clean;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]).join(' ').toUpperCase();
}

const minutes = (clock: string | null) => {
  const m = clock ? /^(\d{1,2}):(\d{2})/.exec(clock) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Baghdad clock minutes of a timestamp. */
const clockOf = (at: Date | null) => {
  if (!at) return null;
  const local = new Date(at.getTime() + 3 * 3600_000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
};

function mostCommon(values: (string | null | undefined)[]): { value: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v?.trim();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: { value: string; count: number } | null = null;
  for (const [value, count] of counts) if (!best || count > best.count) best = { value, count };
  return best;
}

export async function getMemberCardStats(teamMemberId: string): Promise<MemberCardStats | null> {
  const member = await db.query.teamMembers.findFirst({ where: eq(teamMembers.id, teamMemberId) });
  if (!member) return null;

  const nights = await db
    .select({
      eventMemberId: eventMembers.id,
      eventName: events.name,
      date: events.date,
      startTime: events.startTime,
      type: events.type,
      venue: venues.name,
      checkInTime: attendance.checkInTime,
      checkOutTime: attendance.checkOutTime,
      reportedArrivalAt: attendance.reportedArrivalAt,
      reportedDepartureAt: attendance.reportedDepartureAt,
    })
    .from(eventMembers)
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .innerJoin(venues, eq(events.venueId, venues.id))
    .innerJoin(attendance, eq(attendance.eventMemberId, eventMembers.id))
    .where(
      and(
        eq(eventMembers.teamMemberId, teamMemberId),
        ne(eventMembers.status, 'CANCELLED'),
        inArray(events.status, CLOSED),
        inArray(attendance.status, WORKED),
      ),
    )
    .orderBy(asc(events.date));

  const posts = nights.length
    ? await db
        .select({
          eventMemberId: assignments.eventMemberId,
          task: assignments.task,
          gate: gates.name,
          point: workingPoints.name,
        })
        .from(assignments)
        .leftJoin(gates, eq(assignments.gateId, gates.id))
        .leftJoin(workingPoints, eq(assignments.workingPointId, workingPoints.id))
        .where(
          and(
            inArray(assignments.eventMemberId, nights.map((n) => n.eventMemberId)),
            ne(assignments.status, 'CANCELLED'),
          ),
        )
    : [];
  const postOf = new Map(posts.map((p) => [p.eventMemberId, p]));

  const chairs = await db
    .select({ id: seatSetupMembers.id })
    .from(seatSetupMembers)
    .innerJoin(seatSetupDetails, eq(seatSetupMembers.detailId, seatSetupDetails.id))
    .innerJoin(eventMembers, eq(seatSetupMembers.eventMemberId, eventMembers.id))
    .where(
      and(
        eq(eventMembers.teamMemberId, teamMemberId),
        eq(seatSetupMembers.attended, true),
        isNull(seatSetupMembers.declinedAt),
      ),
    );

  const [upcoming] = await db
    .select({ name: events.name, date: events.date, startTime: events.startTime, venue: venues.name, type: events.type })
    .from(eventMembers)
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .innerJoin(venues, eq(events.venueId, venues.id))
    .where(
      and(
        eq(eventMembers.teamMemberId, teamMemberId),
        ne(eventMembers.status, 'CANCELLED'),
        eq(eventMembers.isReserve, false),
        isNull(eventMembers.declinedAt),
        or(isNotNull(eventMembers.notifiedAt), isNotNull(eventMembers.confirmedAt)),
        inArray(events.status, ['PLANNING', 'READY', 'LIVE']),
        gte(events.date, todayISO()),
      ),
    )
    .orderBy(asc(events.date), asc(events.startTime))
    .limit(1);

  let total = 0;
  for (const n of nights) {
    const from = minutes(n.checkInTime) ?? clockOf(n.reportedArrivalAt);
    const to = minutes(n.checkOutTime) ?? clockOf(n.reportedDepartureAt);
    if (from === null || to === null) continue;
    const span = to >= from ? to - from : to + 1440 - from;
    if (span > 0 && span <= 16 * 60) total += span;
  }

  const fav = mostCommon(nights.map((n) => n.venue));
  const role = mostCommon(posts.map((p) => p.task));
  const top = mostCommon(posts.map((p) => p.point ?? p.gate));
  const latest = nights[nights.length - 1];
  const latestPost = latest ? postOf.get(latest.eventMemberId) : undefined;
  const firstYear = nights[0]?.date.slice(0, 4);
  const joinedYear = member.createdAt ? String(new Date(member.createdAt).getUTCFullYear()) : '';

  return {
    name: member.fullName.trim(),
    initials: initialsOf(member.fullName),
    code: member.employeeCode,
    photoUrl: member.photoUrl,
    role: role?.value ?? null,
    events: nights.length,
    venues: new Set(nights.map((n) => n.venue)).size,
    since: firstYear ?? joinedYear,
    hours: Math.round(total / 60),
    chairDays: chairs.length,
    favouriteVenue: fav && fav.count > 1 ? { name: fav.value, count: fav.count } : null,
    topPost: top && top.count > 1 ? top.value : null,
    firstDate: nights[0]?.date ?? null,
    lastDate: latest?.date ?? null,
    stamps: [...nights].reverse().map((n) => ({ name: shortEventName(n.eventName), date: n.date })),
    next: upcoming
      ? { ...upcoming, name: shortEventName(upcoming.name), past: false }
      : latest
        ? { name: shortEventName(latest.eventName), date: latest.date, startTime: latest.startTime, venue: latest.venue, type: latest.type, past: true }
        : null,
    last: latest
      ? {
          name: shortEventName(latest.eventName),
          date: latest.date,
          venue: latest.venue,
          post: latestPost?.gate ?? latestPost?.point ?? null,
        }
      : null,
  };
}
