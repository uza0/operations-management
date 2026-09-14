import 'server-only';

import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  announcements,
  assignments,
  attendance,
  eventAccess,
  eventMembers,
  events,
  gates,
  issues,
  venues,
  workingPoints,
} from '@/db/schema';
import type { SessionUser } from '@/server/auth/session';

export type EventListRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  date: string;
  startTime: string;
  teamArrivalTime: string;
  venueName: string;
  teamSize: number;
  gateCount: number;
  openIssues: number;
};

/** Events the user is allowed to see. Admin sees all; others need a grant. */
export async function listEventsForUser(user: SessionUser): Promise<EventListRow[]> {
  let ids: string[] | null = null;
  if (user.role !== 'ADMIN') {
    const grants = await db
      .select({ eventId: eventAccess.eventId })
      .from(eventAccess)
      .where(eq(eventAccess.userId, user.id));
    ids = grants.map((g) => g.eventId);
    if (ids.length === 0) return [];
  }

  const rows = await db
    .select({
      id: events.id,
      name: events.name,
      type: events.type,
      status: events.status,
      date: events.date,
      startTime: events.startTime,
      teamArrivalTime: events.teamArrivalTime,
      venueName: venues.name,
      teamSize: sql<number>`(select count(*) from ${eventMembers} where ${eventMembers.eventId} = ${events.id})`,
      gateCount: sql<number>`(select count(*) from ${gates} where ${gates.eventId} = ${events.id})`,
      openIssues: sql<number>`(select count(*) from ${issues} where ${issues.eventId} = ${events.id} and ${issues.status} in ('OPEN','ACKNOWLEDGED','IN_PROGRESS'))`,
    })
    .from(events)
    .innerJoin(venues, eq(events.venueId, venues.id))
    .where(ids ? inArray(events.id, ids) : undefined)
    .orderBy(desc(events.date), desc(events.createdAt));

  return rows;
}

export async function getEventOr404(eventId: string) {
  const row = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    with: { venue: true },
  });
  return row ?? null;
}

export type EventSnapshot = {
  teamSize: number;
  reserveCount: number;
  gateCount: number;
  workingPointCount: number;
  assignedCount: number;
  attendance: Record<string, number>;
  openIssues: number;
  announcementCount: number;
};

export async function getEventSnapshot(eventId: string): Promise<EventSnapshot> {
  const [members, gateRows, assignmentRows, attendanceRows, issueRows, announcementRows] =
    await Promise.all([
      db
        .select({ id: eventMembers.id, isReserve: eventMembers.isReserve })
        .from(eventMembers)
        .where(eq(eventMembers.eventId, eventId)),
      db.select({ id: gates.id }).from(gates).where(eq(gates.eventId, eventId)),
      db
        .select({ id: assignments.id })
        .from(assignments)
        .where(and(eq(assignments.eventId, eventId), ne(assignments.status, 'CANCELLED'))),
      db
        .select({ status: attendance.status })
        .from(attendance)
        .where(eq(attendance.eventId, eventId)),
      db
        .select({ status: issues.status })
        .from(issues)
        .where(eq(issues.eventId, eventId)),
      db
        .select({ id: announcements.id })
        .from(announcements)
        .where(eq(announcements.eventId, eventId)),
    ]);

  const counts: Record<string, number> = {
    PENDING: 0,
    PRESENT: 0,
    LATE: 0,
    ABSENT: 0,
    EXCUSED: 0,
  };
  for (const row of attendanceRows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  counts.PENDING += members.length - attendanceRows.length;

  const wpCount = await db.$count(workingPoints, eq(workingPoints.eventId, eventId));

  return {
    teamSize: members.length,
    reserveCount: members.filter((m) => m.isReserve).length,
    gateCount: gateRows.length,
    workingPointCount: wpCount,
    assignedCount: assignmentRows.length,
    attendance: counts,
    openIssues: issueRows.filter((i) =>
      ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'].includes(i.status),
    ).length,
    announcementCount: announcementRows.length,
  };
}
