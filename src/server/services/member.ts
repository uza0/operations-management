import 'server-only';

import { and, asc, desc, eq, ne, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import { mainGateForMember } from '@/server/services/main-gate';
import {
  announcements,
  assignmentChanges,
  assignments,
  attendance,
  eventFeedback,
  eventMembers,
  events,
  gates,
  issues,
  mapMarkers,
  teamMembers,
  timelineItems,
  users,
  venues,
  workingPoints,
  eventAccess,
} from '@/db/schema';

export type MemberPortalData = Awaited<ReturnType<typeof getMemberPortal>>;

/**
 * Everything one member may see, resolved from their token alone.
 *
 * The token is the only input: no member id is accepted from the URL, nothing
 * about other members is returned, and announcements are filtered down to the
 * ones actually addressed to this person (spec §3.4 / §30).
 */
export async function getMemberPortal(token: string) {
  if (!/^[a-f0-9]{32}$/i.test(token)) return null;

  const membership = await db
    .select({
      id: eventMembers.id,
      status: eventMembers.status,
      tokenExpiresAt: eventMembers.tokenExpiresAt,
      isReserve: eventMembers.isReserve,
      eventRole: eventMembers.eventRole,
      memberName: teamMembers.fullName,
      /* Shown on the member's own card: at a gate it is what a supervisor
         asks for, and it is the one identifier safe to print there. */
      memberCode: teamMembers.employeeCode,
      eventId: events.id,
      eventName: events.name,
      eventType: events.type,
      eventDate: events.date,
      eventStart: events.startTime,
      eventArrival: events.teamArrivalTime,
      eventStatus: events.status,
      eventMapUrl: events.mapImageUrl,
      venueName: venues.name,
      venueAddress: venues.address,
      venueMapUrl: venues.mapImageUrl,
      /* Where the place is on a real map — the first thing a member needs,
         and the one thing a printed gate number cannot tell them. */
      venueLocationUrl: venues.locationUrl,
    })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .innerJoin(venues, eq(events.venueId, venues.id))
    .where(eq(eventMembers.token, token))
    .get();

  if (!membership) return null;

  const expired =
    membership.tokenExpiresAt !== null &&
    membership.tokenExpiresAt.getTime() < Date.now();

  const assignment = await db
    .select({
      id: assignments.id,
      task: assignments.task,
      arrivalTime: assignments.arrivalTime,
      shiftStart: assignments.shiftStart,
      shiftEnd: assignments.shiftEnd,
      isGateLeader: assignments.isGateLeader,
      notes: assignments.notes,
      status: assignments.status,
      gateId: assignments.gateId,
      workingPointId: assignments.workingPointId,
      gateName: gates.name,
      gateLeaderMemberId: gates.gateLeaderId,
      workingPointName: workingPoints.name,
      updatedAt: assignments.updatedAt,
    })
    .from(assignments)
    .leftJoin(gates, eq(assignments.gateId, gates.id))
    .leftJoin(workingPoints, eq(assignments.workingPointId, workingPoints.id))
    .where(
      and(
        eq(assignments.eventMemberId, membership.id),
        ne(assignments.status, 'CANCELLED'),
      ),
    )
    .get();

  // Gate leader's name — a colleague's name is exposed only because the member
  // needs to know who to report to.
  let gateLeaderName: string | null = null;
  if (assignment?.gateLeaderMemberId) {
    const leader = await db
      .select({ name: teamMembers.fullName })
      .from(eventMembers)
      .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
      .where(eq(eventMembers.id, assignment.gateLeaderMemberId))
      .get();
    gateLeaderName = leader?.name ?? null;
  }

  const teamLeader = await db
    .select({ name: users.name })
    .from(eventAccess)
    .innerJoin(users, eq(eventAccess.userId, users.id))
    .where(
      and(
        eq(eventAccess.eventId, membership.eventId),
        eq(eventAccess.role, 'TEAM_LEADER'),
      ),
    )
    .get();

  const attendanceRow = await db
    .select({
      status: attendance.status,
      checkInTime: attendance.checkInTime,
      checkOutTime: attendance.checkOutTime,
    })
    .from(attendance)
    .where(eq(attendance.eventMemberId, membership.id))
    .get();

  const now = new Date();
  const announcementRows = (
    await db
      .select()
      .from(announcements)
      .where(eq(announcements.eventId, membership.eventId))
      .orderBy(desc(announcements.createdAt))
  ).filter((row) => {
    if (row.expiresAt && row.expiresAt.getTime() < now.getTime()) return false;
    if (row.audience === 'EVENT') return true;
    if (row.audience === 'GATE') return row.gateId === assignment?.gateId;
    if (row.audience === 'WORKING_POINT') {
      return row.workingPointId === assignment?.workingPointId;
    }
    if (row.audience === 'MEMBER') return row.eventMemberId === membership.id;
    return false;
  });

  const lastChange = assignment
    ? await db
        .select({
          fromLocation: assignmentChanges.fromLocation,
          toLocation: assignmentChanges.toLocation,
          createdAt: assignmentChanges.createdAt,
        })
        .from(assignmentChanges)
        .where(eq(assignmentChanges.assignmentId, assignment.id))
        .orderBy(desc(assignmentChanges.createdAt))
        .get()
    : null;

  /*
   * The hours before the hall opens, when they are spent somewhere else
   * entirely: see src/server/services/main-gate.ts.
   */
  const mainGate = await mainGateForMember(membership.eventId, membership.id);

  /*
   * Their own feedback, so the form opens filled in rather than blank: a
   * member who wants to add a line to what they already said should not have
   * to retype the rest of it.
   */
  const myFeedback = await db
    .select({
      rating: eventFeedback.rating,
      wentWell: eventFeedback.wentWell,
      problems: eventFeedback.problems,
      suggestions: eventFeedback.suggestions,
    })
    .from(eventFeedback)
    .where(
      and(
        eq(eventFeedback.eventId, membership.eventId),
        eq(eventFeedback.eventMemberId, membership.id),
      ),
    )
    .get();

  const markers = await db
    .select({
      id: mapMarkers.id,
      type: mapMarkers.type,
      name: mapMarkers.name,
      x: mapMarkers.x,
      y: mapMarkers.y,
      gateId: mapMarkers.gateId,
      workingPointId: mapMarkers.workingPointId,
    })
    .from(mapMarkers)
    .where(eq(mapMarkers.eventId, membership.eventId));

  const timeline = await db
    .select()
    .from(timelineItems)
    .where(eq(timelineItems.eventId, membership.eventId))
    .orderBy(asc(timelineItems.scheduledTime));

  /*
   * The reporter's own view of what happened to what they reported.
   *
   * A status word on its own does not close the loop — "resolved" by whom, and
   * what did they do? A promoter who watches a problem they can still see get
   * marked resolved from a desk, with no name on it and no way to say so, does
   * not report the next one. So this carries who picked it up, when, what they
   * wrote, and the reopen count that proves saying "it is still happening" does
   * something.
   */
  const myIssues = await db
    .select({
      id: issues.id,
      type: issues.type,
      status: issues.status,
      description: issues.description,
      createdAt: issues.createdAt,
      acknowledgedAt: issues.acknowledgedAt,
      resolvedAt: issues.resolvedAt,
      resolutionNote: issues.resolutionNote,
      reopenCount: issues.reopenCount,
      handlerName: users.name,
    })
    .from(issues)
    .leftJoin(
      users,
      // Whoever holds it now, or whoever closed it when nobody holds it.
      eq(users.id, sql`coalesce(${issues.assigneeUserId}, ${issues.resolvedById})`),
    )
    .where(
      and(
        eq(issues.eventId, membership.eventId),
        eq(issues.reportedByMemberId, membership.id),
      ),
    )
    .orderBy(desc(issues.createdAt));

  return {
    membership,
    expired,
    cancelled: membership.status === 'CANCELLED',
    assignment,
    gateLeaderName,
    teamLeaderName: teamLeader?.name ?? null,
    mainGate,
    myFeedback: myFeedback ?? null,
    attendance: attendanceRow ?? null,
    announcements: announcementRows,
    lastChange,
    markers,
    timeline,
    myIssues,
    mapImageUrl: membership.eventMapUrl ?? membership.venueMapUrl,
  };
}

/** Resolves a token to its event membership for a write action. */
export async function resolveMemberByToken(token: string) {
  if (!/^[a-f0-9]{32}$/i.test(token)) return null;
  return db
    .select({
      id: eventMembers.id,
      eventId: eventMembers.eventId,
      status: eventMembers.status,
      tokenExpiresAt: eventMembers.tokenExpiresAt,
      name: teamMembers.fullName,
    })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(eventMembers.token, token))
    .get();
}

export { or };
