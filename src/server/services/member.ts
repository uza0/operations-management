import 'server-only';

import { and, asc, desc, eq, ne, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import { ARRIVAL_WINDOW_HOURS, stageFor } from '@/lib/journey';
import { effectiveRate } from '@/server/services/credit';
import { mainGateForMember } from '@/server/services/main-gate';
import { seatSetupForMember } from '@/server/services/seat-setup';
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
      teamMemberId: eventMembers.teamMemberId,
      status: eventMembers.status,
      tokenExpiresAt: eventMembers.tokenExpiresAt,
      isReserve: eventMembers.isReserve,
      feedbackAt: eventMembers.feedbackAt,
      confirmedAt: eventMembers.confirmedAt,
      declinedAt: eventMembers.declinedAt,
      declineReason: eventMembers.declineReason,
      respondBy: eventMembers.respondBy,
      notifiedAt: eventMembers.notifiedAt,
      payAmount: eventMembers.payAmount,
      payMode: eventMembers.payMode,
      payoutId: eventMembers.payoutId,
      /* What he is on today, for an event not yet settled — see effectiveRate. */
      personSalaried: teamMembers.salaried,
      personDefaultPay: teamMembers.defaultPay,
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
      eventEnd: events.teamDepartureTime,
      eventPayDefault: events.payDefault,
      boardPublishedAt: events.boardPublishedAt,
      eventMapImageUrl: events.mapImageUrl,
      eventMapDocumentUrl: events.mapDocumentUrl,
      eventMapLinkUrl: events.mapLinkUrl,
      venueName: venues.name,
      venueAddress: venues.address,
      venueMapImageUrl: venues.mapImageUrl,
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

  /*
   * And a draft is nobody's business but the office's, however he arrived.
   *
   * Dropping drafts from his own page would leave the back door open: a link
   * sent for an evening that was later pushed back to a draft would still
   * open it. The refusal belongs here, where every road to this page passes.
   */
  if (membership.eventStatus === 'DRAFT') return null;

  const expired =
    membership.tokenExpiresAt !== null &&
    membership.tokenExpiresAt.getTime() < Date.now();

  /*
   * While the board is a draft the member is told nothing about where he will
   * stand — and is told nothing by the server, not merely shown nothing by the
   * page. The query below does not run at all, so there is no gate name, no
   * task and no shift anywhere in the response for someone reading it with
   * the browser's network tab open.
   */
  const boardPublished = membership.boardPublishedAt !== null;
  const mapSource = membership.eventMapLinkUrl
    ? { kind: 'link' as const, url: membership.eventMapLinkUrl }
    : membership.eventMapDocumentUrl
      ? { kind: 'pdf' as const, url: membership.eventMapDocumentUrl }
      : membership.eventMapImageUrl || membership.venueMapImageUrl
        ? { kind: 'image' as const, url: membership.eventMapImageUrl ?? membership.venueMapImageUrl! }
        : null;

  const loadAssignment = () =>
    db
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

  const assignment = boardPublished ? await loadAssignment() : undefined;

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

  /*
   * Who else is standing here.
   *
   * Names and tasks, and nothing else — no phone numbers, no codes, no way
   * to ask for somebody who is not at this gate. It is the answer to the
   * question a man actually has when he arrives ("who am I with, and who is
   * in charge here"), and it stops at the edge of his own post: the query is
   * keyed to his gate, so a member with no assignment gets an empty list
   * rather than the roster.
   */
  const mates =
    boardPublished && assignment && (assignment.gateId || assignment.workingPointId)
      ? await db
          .select({
            id: eventMembers.id,
            name: teamMembers.fullName,
            task: assignments.task,
            isGateLeader: assignments.isGateLeader,
          })
          .from(assignments)
          .innerJoin(eventMembers, eq(assignments.eventMemberId, eventMembers.id))
          .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
          .where(
            and(
              eq(assignments.eventId, membership.eventId),
              assignment.gateId
                ? eq(assignments.gateId, assignment.gateId)
                : eq(assignments.workingPointId, assignment.workingPointId!),
              ne(assignments.status, 'CANCELLED'),
              ne(eventMembers.status, 'CANCELLED'),
            ),
          )
      : [];

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
      reportedArrivalAt: attendance.reportedArrivalAt,
      approvedAt: attendance.approvedAt,
      reportedDepartureAt: attendance.reportedDepartureAt,
    })
    .from(attendance)
    .where(eq(attendance.eventMemberId, membership.id))
    .get();

  // A private score for this promoter only. It measures whether the member
  // personally reported both arrival and departure; supervisor corrections
  // and scheduled-time backfills do not count as self-registration.
  const attendanceHistory = await db
    .select({
      teamMemberId: eventMembers.teamMemberId,
      eventStatus: events.status,
      memberStatus: eventMembers.status,
      status: attendance.status,
      reportedArrivalAt: attendance.reportedArrivalAt,
      reportedDepartureAt: attendance.reportedDepartureAt,
    })
    .from(eventMembers)
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .leftJoin(attendance, eq(attendance.eventMemberId, eventMembers.id))
  const scoresByMember = new Map<string, { completed: number; total: number }>();
  for (const row of attendanceHistory) {
    const expectedToAttend =
      row.memberStatus === 'CONFIRMED' ||
      row.memberStatus === 'ACTIVE' ||
      row.status === 'PRESENT' ||
      row.status === 'LATE' ||
      row.status === 'ABSENT';
    const eligible =
      (row.eventStatus === 'COMPLETED' || row.eventStatus === 'ARCHIVED') &&
      expectedToAttend &&
      row.status !== 'EXCUSED';
    if (!eligible) continue;

    const score = scoresByMember.get(row.teamMemberId) ?? { completed: 0, total: 0 };
    score.total += 1;
    if (
      (row.status === 'PRESENT' || row.status === 'LATE') &&
      row.reportedArrivalAt !== null &&
      row.reportedDepartureAt !== null
    ) {
      score.completed += 1;
    }
    scoresByMember.set(row.teamMemberId, score);
  }
  const ownScore = scoresByMember.get(membership.teamMemberId) ?? { completed: 0, total: 0 };
  const eligibleForRank = [...scoresByMember.values()].filter((score) => score.total >= 3);
  const ownPercentage = ownScore.total
    ? Math.round((ownScore.completed / ownScore.total) * 100)
    : 0;
  const attendanceRank = ownScore.total >= 3
    ? 1 + eligibleForRank.filter(
        (score) => Math.round((score.completed / score.total) * 100) > ownPercentage,
      ).length
    : null;
  const attendanceScore = {
    completed: ownScore.completed,
    total: ownScore.total,
    percentage: ownPercentage,
    rank: attendanceRank,
    rankedPromoters: eligibleForRank.length,
  };

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

  /* The day before, for whoever is on the crew that sets out the chairs. */
  const seatSetup = await seatSetupForMember(membership.eventId, membership.id);

  /*
   * Whether this person has already answered the questionnaire — not what
   * they answered, which is deliberately unreachable from here. The page
   * needs the bare fact so it can thank them instead of asking twice.
   */
  const answeredFeedback = membership.feedbackAt !== null;

  /*
   * Where he is in all this. One answer, derived from facts that already
   * exist, and the page is a switch on it — see src/lib/journey.ts for why it
   * is not a column.
   */
  const stage = stageFor({
    memberStatus: membership.status,
    confirmedAt: membership.confirmedAt,
    declinedAt: membership.declinedAt,
    eventStatus: membership.eventStatus,
    attendanceStatus: attendanceRow?.status ?? null,
    reportedArrivalAt: attendanceRow?.reportedArrivalAt ?? null,
    approvedAt: attendanceRow?.approvedAt ?? null,
    reportedDepartureAt: attendanceRow?.reportedDepartureAt ?? null,
    eventDate: membership.eventDate,
    teamArrivalTime: membership.eventArrival,
    arrivalWindowHours: ARRIVAL_WINDOW_HOURS,
    now: new Date(),
  });

  /*
   * No site plan and no markers, deliberately: see the member page. The map
   * shows every gate and who is on it, which is the team's distribution. It
   * is not withheld from the screen and fetched anyway — the query simply
   * does not run, so there is nothing about anybody else in the response for
   * somebody reading it with the network tab open.
   */

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
    /** False while the supervisor is still arranging the board. */
    boardPublished,
    mapSource: boardPublished ? mapSource : null,
    expired,
    cancelled: membership.status === 'CANCELLED',
    assignment,
    gateLeaderName,
    /** The people at his own post: see above. Empty before the board is out. */
    mates,
    teamLeaderName: teamLeader?.name ?? null,
    mainGate,
    seatSetup,
    answeredFeedback,
    stage,
    /* The invitation screen's own facts. */
    invitation: {
      respondBy: membership.respondBy,
      confirmedAt: membership.confirmedAt,
      declinedAt: membership.declinedAt,
      declineReason: membership.declineReason,
      /*
       * What this night is worth to him, and only to him.
       *
       * Resolved rather than read: a membership created by cloning last
       * month's event carries no figure at all, and the answer he needs is
       * the rate standing on him today. See effectiveRate.
       */
      payAmount: effectiveRate({
        paid: membership.payoutId !== null,
        payMode: membership.payMode,
        payAmount: membership.payAmount,
        personSalaried: membership.personSalaried,
        personDefaultPay: membership.personDefaultPay,
        eventDefault: membership.eventPayDefault,
      }),
      eventEnd: membership.eventEnd,
    },
    attendance: attendanceRow
      ? {
          status: attendanceRow.status,
          reportedArrivalAt: attendanceRow.reportedArrivalAt,
          approvedAt: attendanceRow.approvedAt,
          reportedDepartureAt: attendanceRow.reportedDepartureAt,
          checkInTime: attendanceRow.checkInTime,
          checkOutTime: attendanceRow.checkOutTime,
        }
      : null,
    attendanceScore,
    announcements: announcementRows,
    lastChange,
    timeline,
    myIssues,
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
