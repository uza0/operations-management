import 'server-only';

import { asc, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  announcements,
  assignmentChanges,
  assignments,
  attendance,
  eventMembers,
  events,
  gates,
  issues,
  teamMembers,
  timelineItems,
  workingPoints,
} from '@/db/schema';
import { feedbackResponses } from '@/db/schema';
import { getStaffedLocations } from '@/server/services/staffing';
import { creditFor } from '@/server/services/credit';
import { DEFAULT_EVENT_PAY } from '@/lib/money';
import {
  FEEDBACK_AGAIN,
  FEEDBACK_BRIEFINGS,
  FEEDBACK_DEGREES,
  FEEDBACK_MIN_GROUP,
  FEEDBACK_PROBLEMS,
  FEEDBACK_RESPONSIBILITY,
  FEEDBACK_STAFFING,
  FEEDBACK_UNSURE,
  type AttendanceStatus,
  type IssueStatus,
  type IssueType,
} from '@/lib/constants';
import { toMinutes } from '@/lib/time';
import { compareNames } from '@/lib/sort';

/**
 * Everything the closing report states, computed in one place.
 *
 * A report is not a screenshot of the dashboard. The dashboard answers "what is
 * happening"; this answers "what happened, how well, and what should change" —
 * so the work here is the arithmetic the dashboard never does: coverage per
 * gate, where the absences actually fell, how long issues took to resolve, and
 * which of those facts is worth putting in front of a manager.
 */

export type AttendanceCounts = Record<AttendanceStatus | 'PENDING', number>;

export type LocationLine = {
  id: string;
  name: string;
  kind: 'GATE' | 'POINT';
  required: number;
  assigned: number;
  difference: number;
  /** Assigned ÷ required, capped at 100 — the number a manager reads first. */
  coverage: number;
  present: number;
  absent: number;
  late: number;
};

/** One person on the closing report: named, with what they were owed. */
export type RosterLine = {
  eventMemberId: string;
  name: string;
  employeeCode: string;
  locationName: string | null;
  task: string | null;
  status: AttendanceStatus;
  checkInTime: string | null;
  checkOutTime: string | null;
  isReserve: boolean;
  /** null when the company pays this person monthly — see creditFor. */
  amount: number | null;
  note: string | null;
};

export type ReportData = {
  team: { total: number; reserve: number; assigned: number; briefed: number };
  attendance: AttendanceCounts & { rate: number; punctualityRate: number };
  /**
   * Everyone on the event, by name. A closing report that says "26 present"
   * cannot be checked by the person who was there; a list of who they were
   * can, and it is the same list payroll is paid against.
   */
  roster: RosterLine[];
  payDefault: number;
  totalPay: number;
  locations: LocationLine[];
  understaffed: LocationLine[];
  fullyStaffed: number;
  changes: Array<{
    id: string;
    memberName: string;
    fromLocation: string | null;
    toLocation: string | null;
    reason: string | null;
    changedByName: string;
    createdAt: Date;
  }>;
  issues: {
    rows: Array<{
      id: string;
      type: IssueType;
      status: IssueStatus;
      priority: string;
      description: string;
      locationName: string | null;
      reporterName: string;
      createdAt: Date;
      resolvedAt: Date | null;
      resolutionNote: string | null;
      minutesToResolve: number | null;
    }>;
    total: number;
    resolved: number;
    open: number;
    byType: Array<{ type: IssueType; count: number }>;
    averageMinutesToResolve: number | null;
  };
  announcements: { total: number; urgent: number };
  timeline: Array<{
    id: string;
    title: string;
    description: string | null;
    scheduledTime: string;
    status: string;
  }>;
  timelineDone: number;
  tasks: Array<{ task: string; count: number }>;
  /**
   * What the people who worked it said afterwards. The rest of this report is
   * measured; this is the only part of it that is felt, and it is the part
   * that says why a gate that looks fully staffed on paper was chaos at eight
   * o'clock.
   */
  feedback: {
    /** How many answered, and how many were asked. */
    responses: number;
    asked: number;
    /** Null until enough answers arrived for an average to mean anything. */
    scores: Array<{ key: string; average: number }> | null;
    /** Each closed question as counts per answer, in the enum's own order. */
    choices: Array<{ key: string; counts: Array<{ value: string; count: number }> }> | null;
    /** The written answers, unattributed, newest first. */
    comments: Array<{ key: string; text: string }>;
  };
};

/** The four questions answered on a one-to-five scale. */
const SCORE_KEYS = ['instructionsClear', 'organisation', 'supportSpeed', 'overall'] as const;

/** The closed questions, each with the list of answers it accepts. */
const CHOICE_KEYS: Array<[string, readonly string[]]> = [
  ['knewDuties', FEEDBACK_DEGREES],
  ['briefingLength', FEEDBACK_BRIEFINGS],
  ['staffing', FEEDBACK_STAFFING],
  ['distributionGood', FEEDBACK_DEGREES],
  ['unsureMoments', FEEDBACK_UNSURE],
  ['knewWhoToAsk', FEEDBACK_DEGREES],
  ['problemKind', FEEDBACK_PROBLEMS],
  ['guestsInformed', FEEDBACK_DEGREES],
  ['workAgain', FEEDBACK_AGAIN],
  ['moreResponsibility', FEEDBACK_RESPONSIBILITY],
];

/** The questions answered in words. */
const COMMENT_KEYS = [
  'unsureWhy',
  'problemPrevention',
  'guestCommonIssue',
  'guestImprovement',
  'keepDoing',
  'hardest',
  'freeNote',
] as const;

/**
 * Turns the answers into something a supervisor can read without being able
 * to work out who said what.
 *
 * The count of answers is always shown — chasing the rest of the team is the
 * one thing this has to support. Everything else waits for FEEDBACK_MIN_GROUP
 * answers: an average over one response is that person's score with their
 * name removed, which is not anonymity, and a single written line next to a
 * single score is a signed statement in all but name.
 */
function summariseFeedback(
  rows: Array<Record<string, unknown>>,
  asked: number,
): ReportData['feedback'] {
  if (rows.length < FEEDBACK_MIN_GROUP) {
    return { responses: rows.length, asked, scores: null, choices: null, comments: [] };
  }

  const scores = SCORE_KEYS.map((key) => {
    const values = rows
      .map((row) => row[key])
      .filter((value): value is number => typeof value === 'number');
    const average = values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
    return { key, average: Math.round(average * 10) / 10 };
  }).filter((entry) => entry.average > 0);

  const choices = CHOICE_KEYS.map(([key, options]) => ({
    key,
    counts: options
      .map((value) => ({
        value,
        count: rows.filter((row) => row[key] === value).length,
      }))
      .filter((entry) => entry.count > 0),
  })).filter((entry) => entry.counts.length > 0);

  /*
   * The written answers are shuffled before they are listed. Left in the
   * order they arrived, the rows line up: the first comment under every
   * question belongs to the same person, and reading down the column
   * reassembles one anonymous answer into one identifiable account of the
   * evening.
   */
  const comments: Array<{ key: string; text: string }> = [];
  for (const key of COMMENT_KEYS) {
    const texts = rows
      .map((row) => row[key])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    for (const text of shuffle(texts)) comments.push({ key, text });
  }

  return { responses: rows.length, asked, scores, choices, comments };
}

/** Fisher–Yates, on a copy. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
}

export async function buildReport(eventId: string): Promise<ReportData> {
  const [
    locationRows,
    assignmentRows,
    memberRows,
    attendanceRows,
    issueRows,
    announcementRows,
    changeRows,
    timelineRows,
    gateRows,
    pointRows,
    eventRow,
    feedbackRows,
  ] = await Promise.all([
    getStaffedLocations(eventId),
    db
      .select({
        id: assignments.id,
        eventMemberId: assignments.eventMemberId,
        gateId: assignments.gateId,
        workingPointId: assignments.workingPointId,
        task: assignments.task,
        status: assignments.status,
      })
      .from(assignments)
      .where(eq(assignments.eventId, eventId)),
    db
      .select({
        id: eventMembers.id,
        isReserve: eventMembers.isReserve,
        notifiedAt: eventMembers.notifiedAt,
        payAmount: eventMembers.payAmount,
        payMode: eventMembers.payMode,
        payoutId: eventMembers.payoutId,
        personSalaried: teamMembers.salaried,
        personDefaultPay: teamMembers.defaultPay,
        creditNote: eventMembers.creditNote,
        name: teamMembers.fullName,
        employeeCode: teamMembers.employeeCode,
      })
      .from(eventMembers)
      .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
      .where(eq(eventMembers.eventId, eventId)),
    db
      .select({
        eventMemberId: attendance.eventMemberId,
        status: attendance.status,
        checkInTime: attendance.checkInTime,
        checkOutTime: attendance.checkOutTime,
      })
      .from(attendance)
      .where(eq(attendance.eventId, eventId)),
    db
      .select()
      .from(issues)
      .where(eq(issues.eventId, eventId))
      .orderBy(desc(issues.createdAt)),
    db
      .select({ priority: announcements.priority })
      .from(announcements)
      .where(eq(announcements.eventId, eventId)),
    db
      .select({
        id: assignmentChanges.id,
        fromLocation: assignmentChanges.fromLocation,
        toLocation: assignmentChanges.toLocation,
        reason: assignmentChanges.reason,
        changedByName: assignmentChanges.changedByName,
        createdAt: assignmentChanges.createdAt,
        memberName: teamMembers.fullName,
      })
      .from(assignmentChanges)
      .innerJoin(assignments, eq(assignmentChanges.assignmentId, assignments.id))
      .innerJoin(eventMembers, eq(assignments.eventMemberId, eventMembers.id))
      .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
      .where(eq(assignments.eventId, eventId))
      .orderBy(desc(assignmentChanges.createdAt)),
    db
      .select()
      .from(timelineItems)
      .where(eq(timelineItems.eventId, eventId))
      .orderBy(asc(timelineItems.scheduledTime)),
    db.select({ id: gates.id, name: gates.name }).from(gates).where(eq(gates.eventId, eventId)),
    db
      .select({ id: workingPoints.id, name: workingPoints.name })
      .from(workingPoints)
      .where(eq(workingPoints.eventId, eventId)),
    db
      .select({ payDefault: events.payDefault, status: events.status })
      .from(events)
      .where(eq(events.id, eventId))
      .get(),
    /*
     * No join to a member and no name column — there is nothing to join to.
     * The questionnaire is stored apart from the people who filled it in, on
     * purpose, and this query is where that promise is either kept or quietly
     * broken.
     */
    db
      .select()
      .from(feedbackResponses)
      .where(eq(feedbackResponses.eventId, eventId))
      .orderBy(desc(feedbackResponses.submittedAt)),
  ]);

  /* ---- attendance ------------------------------------------------------- */
  const statusByMember = new Map<string, AttendanceStatus>();
  for (const row of attendanceRows) {
    statusByMember.set(row.eventMemberId, row.status as AttendanceStatus);
  }

  const counts: AttendanceCounts = {
    PENDING: 0,
    PRESENT: 0,
    LATE: 0,
    ABSENT: 0,
    EXCUSED: 0,
  };
  for (const member of memberRows) {
    const status = statusByMember.get(member.id) ?? 'PENDING';
    counts[status] = (counts[status] ?? 0) + 1;
  }

  const total = memberRows.length;
  const turnedUp = counts.PRESENT + counts.LATE;
  const rate = total > 0 ? Math.round((turnedUp / total) * 100) : 0;
  // Of the people who came, how many were on time — a different question from
  // attendance, and the one that predicts whether gates open on schedule.
  const punctualityRate = turnedUp > 0 ? Math.round((counts.PRESENT / turnedUp) * 100) : 0;

  /* ---- where the absences fell ------------------------------------------ */
  const active = assignmentRows.filter((a) => a.status !== 'CANCELLED');
  const locationOf = new Map<string, string>();
  for (const a of active) {
    const locationId = a.gateId ?? a.workingPointId;
    if (locationId) locationOf.set(a.eventMemberId, locationId);
  }

  const perLocation = new Map<string, { present: number; late: number; absent: number }>();
  for (const member of memberRows) {
    const locationId = locationOf.get(member.id);
    if (!locationId) continue;
    const bucket = perLocation.get(locationId) ?? { present: 0, late: 0, absent: 0 };
    const status = statusByMember.get(member.id) ?? 'PENDING';
    if (status === 'PRESENT') bucket.present += 1;
    else if (status === 'LATE') bucket.late += 1;
    else if (status === 'ABSENT') bucket.absent += 1;
    perLocation.set(locationId, bucket);
  }

  const gateIds = new Set(gateRows.map((g) => g.id));
  const locations: LocationLine[] = locationRows.map((l) => {
    const bucket = perLocation.get(l.id) ?? { present: 0, late: 0, absent: 0 };
    return {
      id: l.id,
      name: l.name,
      kind: gateIds.has(l.id) ? 'GATE' : 'POINT',
      required: l.requiredStaff,
      assigned: l.assignedStaff,
      difference: l.difference,
      coverage:
        l.requiredStaff > 0
          ? Math.min(100, Math.round((l.assignedStaff / l.requiredStaff) * 100))
          : 100,
      present: bucket.present,
      late: bucket.late,
      absent: bucket.absent,
    };
  });

  /* ---- issues ----------------------------------------------------------- */
  const locationNames = new Map<string, string>([
    ...gateRows.map((g) => [g.id, g.name] as const),
    ...pointRows.map((p) => [p.id, p.name] as const),
  ]);

  const issueLines = issueRows.map((row) => {
    const resolvedAt = row.resolvedAt ?? null;
    return {
      id: row.id,
      type: row.type as IssueType,
      status: row.status as IssueStatus,
      priority: row.priority,
      description: row.description,
      locationName:
        (row.gateId ? locationNames.get(row.gateId) : null) ??
        (row.workingPointId ? locationNames.get(row.workingPointId) : null) ??
        null,
      reporterName: row.reporterName,
      createdAt: row.createdAt,
      resolvedAt,
      resolutionNote: row.resolutionNote,
      minutesToResolve: resolvedAt ? minutesBetween(row.createdAt, resolvedAt) : null,
    };
  });

  const resolvedDurations = issueLines
    .map((i) => i.minutesToResolve)
    .filter((m): m is number => m !== null);

  const byTypeMap = new Map<IssueType, number>();
  for (const issue of issueLines) {
    byTypeMap.set(issue.type, (byTypeMap.get(issue.type) ?? 0) + 1);
  }

  /* ---- tasks ------------------------------------------------------------ */
  const taskMap = new Map<string, number>();
  for (const a of active) taskMap.set(a.task, (taskMap.get(a.task) ?? 0) + 1);

  /* ---- the roster, by name ---------------------------------------------- */
  const payDefault = eventRow?.payDefault ?? DEFAULT_EVENT_PAY;
  /* The closing document states what was earned, not what was offered. */
  const eventStatus = eventRow?.status ?? null;
  const timesByMember = new Map(
    attendanceRows.map((row) => [row.eventMemberId, row] as const),
  );
  const assignmentOf = new Map(active.map((a) => [a.eventMemberId, a] as const));

  const roster: RosterLine[] = memberRows
    .map((member) => {
      const status = statusByMember.get(member.id) ?? 'PENDING';
      const times = timesByMember.get(member.id);
      const assignment = assignmentOf.get(member.id);
      const locationId = assignment?.gateId ?? assignment?.workingPointId ?? null;
      return {
        eventMemberId: member.id,
        name: member.name,
        employeeCode: member.employeeCode,
        locationName: locationId ? (locationNames.get(locationId) ?? null) : null,
        task: assignment?.task ?? null,
        status,
        checkInTime: times?.checkInTime ?? null,
        checkOutTime: times?.checkOutTime ?? null,
        isReserve: member.isReserve,
        amount: creditFor({
          payMode: member.payMode,
          status,
          payAmount: member.payAmount,
          eventDefault: payDefault,
          eventStatus,
          paid: member.payoutId !== null,
          personSalaried: member.personSalaried,
          personDefaultPay: member.personDefaultPay,
        }),
        note: member.creditNote,
      };
    })
    /*
     * Ordered the way the report reads: the people who worked first, then the
     * ones who did not, and alphabetically inside each group — so a supervisor
     * checking one name knows where to look.
     */
    .sort((a, b) => {
      const rank = (line: RosterLine) =>
        line.status === 'PRESENT' ? 0 : line.status === 'LATE' ? 1 : 2;
      return rank(a) - rank(b) || compareNames(a.name, b.name);
    });

  return {
    roster,
    payDefault,
    totalPay: roster.reduce((sum, line) => sum + (line.amount ?? 0), 0),
    team: {
      total,
      reserve: memberRows.filter((m) => m.isReserve).length,
      assigned: new Set(active.map((a) => a.eventMemberId)).size,
      briefed: memberRows.filter((m) => m.notifiedAt).length,
    },
    attendance: { ...counts, rate, punctualityRate },
    locations,
    // `difference` follows the staffing service's convention: required minus
    // assigned, so a POSITIVE number is a shortfall.
    understaffed: locations.filter((l) => l.difference > 0),
    fullyStaffed: locations.filter((l) => l.difference <= 0).length,
    changes: changeRows,
    issues: {
      rows: issueLines,
      total: issueLines.length,
      resolved: issueLines.filter((i) => i.status === 'RESOLVED' || i.status === 'CLOSED')
        .length,
      open: issueLines.filter((i) => i.status !== 'RESOLVED' && i.status !== 'CLOSED').length,
      byType: [...byTypeMap.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      averageMinutesToResolve:
        resolvedDurations.length > 0
          ? Math.round(
              resolvedDurations.reduce((sum, m) => sum + m, 0) / resolvedDurations.length,
            )
          : null,
    },
    announcements: {
      total: announcementRows.length,
      urgent: announcementRows.filter((a) => a.priority === 'URGENT').length,
    },
    timeline: timelineRows
      .slice()
      .sort((a, b) => toMinutes(a.scheduledTime) - toMinutes(b.scheduledTime))
      .map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        scheduledTime: row.scheduledTime,
        status: row.status,
      })),
    feedback: summariseFeedback(feedbackRows, memberRows.length),
    timelineDone: timelineRows.filter((r) => r.status === 'COMPLETED').length,
    tasks: [...taskMap.entries()]
      .map(([task, count]) => ({ task, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/* -------------------------------------------------------------------------- */
/* Findings and recommendations                                                */
/* -------------------------------------------------------------------------- */

/**
 * The sentences a manager reads first.
 *
 * Deliberately arithmetic, not opinion: every line below is a statement of what
 * the data says, and every recommendation names a number someone can act on.
 * A report that says "attendance was good" is worth nothing; "Gate 3 ran at
 * 3 of 5 all evening — add two next time" is worth the meeting.
 */
export function buildFindings(
  data: ReportData,
  t: { report: { f: Record<string, string>; none: string } },
  format: (template: string, values: Record<string, string | number>) => string,
): { findings: string[]; recommendations: string[] } {
  const f = t.report.f;
  const findings: string[] = [];
  const recommendations: string[] = [];

  findings.push(
    format(f.staffed, {
      assigned: data.team.assigned,
      // "spread across N locations" means the ones that actually carried
      // someone, not every location that exists on the plan.
      locations: data.locations.filter((l) => l.assigned > 0).length,
      total: data.team.total,
      reserve: data.team.reserve,
    }),
  );

  if (data.understaffed.length > 0) {
    findings.push(
      format(f.understaffed, {
        n: data.understaffed.length,
        names: data.understaffed.map((l) => `${l.name} (${l.assigned}/${l.required})`).join('، '),
      }),
    );
    for (const location of data.understaffed) {
      recommendations.push(
        format(f.recAddStaff, { name: location.name, n: Math.abs(location.difference) }),
      );
    }
  } else if (data.locations.length > 0) {
    findings.push(f.allStaffed);
  }

  findings.push(
    format(f.attendance, {
      rate: data.attendance.rate,
      present: data.attendance.PRESENT,
      late: data.attendance.LATE,
      absent: data.attendance.ABSENT,
    }),
  );

  if (data.attendance.LATE > 0) {
    findings.push(format(f.punctual, { rate: data.attendance.punctualityRate }));
  }

  const withAbsences = data.locations.filter((l) => l.absent > 0);
  if (withAbsences.length > 0) {
    const names = withAbsences.map((l) => `${l.name} (${l.absent})`).join('، ');
    findings.push(format(f.absencesAt, { names }));
    recommendations.push(format(f.recAbsence, { names }));
  }

  if (data.issues.total > 0) {
    findings.push(
      format(f.issues, {
        total: data.issues.total,
        resolved: data.issues.resolved,
        avg: data.issues.averageMinutesToResolve ?? 0,
      }),
    );
    if (data.issues.open > 0) {
      findings.push(format(f.issuesOpen, { n: data.issues.open }));
      recommendations.push(format(f.recOpenIssues, { n: data.issues.open }));
    }
    if ((data.issues.averageMinutesToResolve ?? 0) > 30) {
      recommendations.push(
        format(f.recResolve, { avg: data.issues.averageMinutesToResolve ?? 0 }),
      );
    }
  } else {
    findings.push(f.noIssues);
  }

  findings.push(
    data.changes.length > 0 ? format(f.changes, { n: data.changes.length }) : f.noChanges,
  );

  if (data.team.total > 0) {
    findings.push(
      format(f.briefed, { briefed: data.team.briefed, total: data.team.total }),
    );
    const unbriefed = data.team.total - data.team.briefed;
    if (unbriefed > 0 && data.team.briefed > 0) {
      recommendations.push(format(f.recBrief, { n: unbriefed }));
    }
  }

  if (data.timeline.length > 0) {
    findings.push(
      format(f.timeline, { done: data.timelineDone, total: data.timeline.length }),
    );
  }

  if (data.announcements.total > 0) {
    findings.push(
      format(f.announcements, {
        total: data.announcements.total,
        urgent: data.announcements.urgent,
      }),
    );
  }

  if (recommendations.length === 0) recommendations.push(f.recNone);

  return { findings, recommendations };
}
