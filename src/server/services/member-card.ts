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
import { getMemberAttendanceScore } from '@/server/services/member';

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
  next: { name: string; date: string; startTime: string; venue: string; type: string; past: boolean; posterUrl: string | null } | null;
  /** Every night he worked, newest first — what the picker cards choose from. */
  worked: WorkedNight[];
  /** Self-recorded arrival and departure, as the attendance page counts it. */
  score: { percentage: number; completed: number; total: number; rank: number | null; ranked: number } | null;
};

export type Mate = { name: string; photoUrl: string; lead: boolean; me: boolean };

export type WorkedNight = {
  key: string;
  name: string;
  date: string;
  venue: string;
  type: string;
  posterUrl: string | null;
  inAt: string | null;
  outAt: string | null;
  /** Gate or working point he stood at. */
  post: string | null;
  task: string | null;
  /** TEAM_LEADER | ASSISTANT_TEAM_LEADER | GATE_LEADER | SECTION_SUPERVISOR, or null. */
  role: string | null;
  /** How many worked that night. */
  crew: number;
  /** Faces for the group cards: approved photos of people who did not opt out. */
  team: Mate[];
  gateTeam: Mate[];
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
      eventId: events.id,
      eventRole: eventMembers.eventRole,
      eventName: events.name,
      date: events.date,
      startTime: events.startTime,
      posterUrl: events.posterUrl,
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
          isGateLeader: assignments.isGateLeader,
          gateId: assignments.gateId,
          workingPointId: assignments.workingPointId,
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
    .select({ name: events.name, date: events.date, startTime: events.startTime, venue: venues.name, type: events.type, posterUrl: events.posterUrl })
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

  /*
   * The nights' crews, for the group cards and "how big was it". Only the
   * last 30 nights: no card reaches further back than a picker can show.
   */
  const recent = [...nights].reverse().slice(0, 30);
  const crewRows = recent.length
    ? await db
        .select({
          eventId: eventMembers.eventId,
          teamMemberId: eventMembers.teamMemberId,
          name: teamMembers.fullName,
          photoUrl: teamMembers.photoUrl,
          hidden: teamMembers.hideFromGroupCards,
          eventRole: eventMembers.eventRole,
          gateId: assignments.gateId,
          workingPointId: assignments.workingPointId,
          isGateLeader: assignments.isGateLeader,
        })
        .from(attendance)
        .innerJoin(eventMembers, eq(attendance.eventMemberId, eventMembers.id))
        .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
        .leftJoin(assignments, and(eq(assignments.eventMemberId, eventMembers.id), ne(assignments.status, 'CANCELLED')))
        .where(and(inArray(eventMembers.eventId, recent.map((n) => n.eventId)), inArray(attendance.status, WORKED), ne(eventMembers.status, 'CANCELLED')))
    : [];
  const hhmm = (clockText: string | null, at: Date | null) => {
    const m = minutes(clockText) ?? clockOf(at);
    return m === null ? null : `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  const worked: WorkedNight[] = recent.map((n) => {
    const post = postOf.get(n.eventMemberId);
    const crew = crewRows.filter((r) => r.eventId === n.eventId);
    const face = (r: (typeof crew)[number]): Mate => ({
      name: r.name.trim(),
      photoUrl: r.photoUrl!,
      lead: Boolean(r.isGateLeader) || r.eventRole === 'SECTION_SUPERVISOR' || r.eventRole === 'TEAM_LEADER',
      me: r.teamMemberId === teamMemberId,
    });
    const shown = crew.filter((r) => r.photoUrl && (!r.hidden || r.teamMemberId === teamMemberId));
    const samePost = (r: (typeof crew)[number]) =>
      post && ((post.gateId && r.gateId === post.gateId) || (post.workingPointId && r.workingPointId === post.workingPointId));
    return {
      key: n.eventMemberId,
      name: shortEventName(n.eventName),
      date: n.date,
      venue: n.venue,
      type: n.type,
      posterUrl: n.posterUrl ?? null,
      inAt: hhmm(n.checkInTime, n.reportedArrivalAt),
      outAt: hhmm(n.checkOutTime, n.reportedDepartureAt),
      post: post?.point ?? post?.gate ?? null,
      task: post?.task ?? null,
      role: n.eventRole ?? (post?.isGateLeader ? 'GATE_LEADER' : null),
      crew: new Set(crew.map((r) => r.teamMemberId)).size,
      team: shown.slice(0, 40).map(face),
      gateTeam: shown.filter(samePost).slice(0, 24).map(face),
    };
  });
  const rawScore = await getMemberAttendanceScore(teamMemberId).catch(() => null);

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
        ? { name: shortEventName(latest.eventName), date: latest.date, startTime: latest.startTime, venue: latest.venue, type: latest.type, posterUrl: latest.posterUrl ?? null, past: true }
        : null,
    worked,
    score: rawScore && rawScore.total > 0
      ? { percentage: rawScore.percentage, completed: rawScore.completed, total: rawScore.total, rank: rawScore.rank, ranked: rawScore.rankedPromoters }
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
