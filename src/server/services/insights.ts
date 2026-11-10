import 'server-only';

import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';

import { db } from '@/db';
import {
  attendance,
  eventExpenses,
  eventFeedback,
  eventMembers,
  events,
  issues,
  payouts,
  seatSetupMembers,
  teamMembers,
} from '@/db/schema';
import { payrollLedger, WORKED_STATUSES } from '@/server/services/credit';
import type { AttendanceStatus } from '@/lib/constants';

/**
 * The system, in numbers.
 *
 * Every other screen answers a question about one evening: who is on gate 4,
 * who has not confirmed, what did this event cost. This one answers a
 * question about the company — what has the operation actually done over a
 * stretch of months — and it is the only screen whose reader is not running
 * an event tonight.
 *
 * Nothing here writes, nothing here is per-event, and nothing here invents a
 * figure: every number below is counted from rows that already exist because
 * somebody did the work and somebody recorded it. Where a number cannot be
 * known it is reported as unknown rather than as zero, because a zero in a
 * management report is read as a fact.
 */

export type Range = { from: string; to: string };

/** A month of the operation, for the shape of the thing over time. */
export type MonthPoint = {
  /** YYYY-MM */
  month: string;
  events: number;
  shifts: number;
  wages: number;
};

export type Insights = {
  range: Range;
  generatedAt: Date;

  events: {
    total: number;
    closed: number;
    live: number;
    upcoming: number;
    byType: { key: string; n: number }[];
    venues: number;
    firstDate: string | null;
    lastDate: string | null;
  };

  people: {
    /** On the books today, not in the range — a roster is a present-tense thing. */
    activeNow: number;
    /** Distinct people who actually stood somewhere in the range. */
    worked: number;
    /** Joined the roster during the range. */
    joined: number;
    /** One person on one event. The unit the company really buys. */
    shifts: number;
    /** Chair-setting shifts, which are a separate day's work. */
    seatShifts: number;
    avgCrew: number;
    /** Most shifts in the range, longest-serving first. */
    top: { name: string; shifts: number }[];
  };

  attendance: {
    present: number;
    late: number;
    absent: number;
    excused: number;
    /** Closed events whose attendance nobody ever marked. */
    unrecorded: number;
    /** (present + late) / (present + late + absent) — null when nothing to judge. */
    showRate: number | null;
    lateRate: number | null;
    /** Pressed «وصلت» on their own phone, rather than being marked by a leader. */
    selfReported: number;
    selfReportedRate: number | null;
  };

  invitations: {
    sent: number;
    confirmed: number;
    declined: number;
    confirmRate: number | null;
  };

  money: {
    /** Handed over inside the range, from the payment files themselves. */
    settled: number;
    payouts: number;
    /** Over, not yet handed over, as of now. */
    owedNow: number;
    /** Event costs recorded against events in the range. */
    expenses: number;
    perEvent: number | null;
    perShift: number | null;
  };

  issues: {
    total: number;
    resolved: number;
    resolvedRate: number | null;
    /** Minutes from raised to resolved, median — the half that took longer. */
    medianMinutes: number | null;
    byType: { key: string; n: number }[];
  };

  feedback: {
    responses: number;
    /** 1–5, null when nobody answered. */
    averageRating: number | null;
    responseRate: number | null;
  };

  months: MonthPoint[];
};

function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function counted(entries: (string | null)[]): { key: string; n: number }[] {
  const tally = new Map<string, number>();
  for (const entry of entries) {
    const key = entry ?? 'OTHER';
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([key, n]) => ({ key, n }))
    .sort((a, b) => b.n - a.n);
}

/**
 * Counts everything in one pass over the range.
 *
 * Drafts are left out everywhere, exactly as they are left out of the money:
 * an evening somebody is still building is not an evening the company ran,
 * and counting it here would inflate the one number a reader checks first.
 */
export async function collectInsights(range: Range): Promise<Insights> {
  const inRange = and(
    ne(events.status, 'DRAFT'),
    gte(events.date, range.from),
    lte(events.date, range.to),
  );

  const eventRows = await db
    .select({
      id: events.id,
      date: events.date,
      type: events.type,
      status: events.status,
      venueId: events.venueId,
    })
    .from(events)
    .where(inRange)
    .all();

  const eventIds = eventRows.map((row) => row.id);
  const closedIds = new Set(
    eventRows
      .filter((row) => row.status === 'COMPLETED' || row.status === 'ARCHIVED')
      .map((row) => row.id),
  );

  /*
   * Everything below hangs off those events, so when the range holds none,
   * the queries are skipped rather than run with an empty IN () — which some
   * drivers answer with every row in the table.
   */
  const [
    memberRows,
    seatRows,
    issueRows,
    feedbackRows,
    expenseRows,
    payoutRows,
    activeNow,
    joined,
    ledger,
  ] = await Promise.all([
    eventIds.length
      ? db
          .select({
            eventId: eventMembers.eventId,
            memberId: eventMembers.teamMemberId,
            name: teamMembers.fullName,
            status: eventMembers.status,
            isReserve: eventMembers.isReserve,
            confirmedAt: eventMembers.confirmedAt,
            declinedAt: eventMembers.declinedAt,
            attendanceStatus: attendance.status,
            reportedArrivalAt: attendance.reportedArrivalAt,
          })
          .from(eventMembers)
          .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
          .leftJoin(attendance, eq(attendance.eventMemberId, eventMembers.id))
          .where(inArray(eventMembers.eventId, eventIds))
          .all()
      : [],
    eventIds.length
      ? db
          .select({ attended: seatSetupMembers.attended })
          .from(seatSetupMembers)
          .innerJoin(
            eventMembers,
            eq(seatSetupMembers.eventMemberId, eventMembers.id),
          )
          .where(inArray(eventMembers.eventId, eventIds))
          .all()
      : [],
    eventIds.length
      ? db
          .select({
            type: issues.type,
            status: issues.status,
            createdAt: issues.createdAt,
            resolvedAt: issues.resolvedAt,
          })
          .from(issues)
          .where(inArray(issues.eventId, eventIds))
          .all()
      : [],
    eventIds.length
      ? db
          .select({ rating: eventFeedback.rating })
          .from(eventFeedback)
          .where(inArray(eventFeedback.eventId, eventIds))
          .all()
      : [],
    eventIds.length
      ? db
          .select({ amount: eventExpenses.amount })
          .from(eventExpenses)
          .where(inArray(eventExpenses.eventId, eventIds))
          .all()
      : [],
    db
      .select({
        total: payouts.totalAmount,
        expenses: payouts.expensesTotal,
        createdAt: payouts.createdAt,
      })
      .from(payouts)
      .all(),
    db.$count(teamMembers, eq(teamMembers.active, true)),
    db
      .select({ createdAt: teamMembers.createdAt })
      .from(teamMembers)
      .all(),
    payrollLedger(),
  ]);

  /* ---- events ---------------------------------------------------------- */

  const dates = eventRows.map((row) => row.date).sort();
  const eventStats: Insights['events'] = {
    total: eventRows.length,
    closed: closedIds.size,
    live: eventRows.filter((row) => row.status === 'LIVE').length,
    upcoming: eventRows.filter((row) =>
      ['PLANNING', 'READY'].includes(row.status),
    ).length,
    byType: counted(eventRows.map((row) => row.type)),
    venues: new Set(eventRows.map((row) => row.venueId).filter(Boolean)).size,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
  };

  /* ---- people ---------------------------------------------------------- */

  /*
   * A reserve was never asked to come, and a cancelled membership was taken
   * off again. Neither is a shift the company bought, and counting them was
   * the difference between "we ran 34 people" and "we invited 41".
   */
  const shiftRows = memberRows.filter(
    (row) => !row.isReserve && row.status !== 'CANCELLED',
  );

  const byPerson = new Map<string, { name: string; shifts: number }>();
  for (const row of shiftRows) {
    const entry = byPerson.get(row.memberId) ?? { name: row.name, shifts: 0 };
    entry.shifts += 1;
    byPerson.set(row.memberId, entry);
  }

  const from = new Date(`${range.from}T00:00:00Z`).getTime();
  const to = new Date(`${range.to}T23:59:59Z`).getTime();

  const people: Insights['people'] = {
    activeNow,
    worked: byPerson.size,
    joined: joined.filter((row) => {
      const at = row.createdAt?.getTime() ?? 0;
      return at >= from && at <= to;
    }).length,
    shifts: shiftRows.length,
    seatShifts: seatRows.filter((row) => row.attended).length,
    avgCrew: eventRows.length ? shiftRows.length / eventRows.length : 0,
    top: [...byPerson.values()]
      .sort((a, b) => b.shifts - a.shifts)
      .slice(0, 10),
  };

  /* ---- attendance ------------------------------------------------------ */

  /*
   * Judged only on events that are over. An evening still ahead has nobody
   * absent from it, and folding those rows in drags every rate towards a
   * flattering nothing.
   */
  const judged = shiftRows.filter((row) => closedIds.has(row.eventId));
  const tally = (status: AttendanceStatus) =>
    judged.filter((row) => row.attendanceStatus === status).length;

  const present = tally('PRESENT');
  const late = tally('LATE');
  const absent = tally('ABSENT');
  const excused = tally('EXCUSED');
  const worked = present + late;
  const decided = worked + absent;
  const selfReported = judged.filter((row) => row.reportedArrivalAt).length;

  const attendanceStats: Insights['attendance'] = {
    present,
    late,
    absent,
    excused,
    unrecorded: judged.filter(
      (row) => !row.attendanceStatus || row.attendanceStatus === 'PENDING',
    ).length,
    showRate: rate(worked, decided),
    lateRate: rate(late, worked),
    selfReported,
    selfReportedRate: rate(selfReported, judged.length),
  };

  /* ---- invitations ----------------------------------------------------- */

  const invitations: Insights['invitations'] = {
    sent: memberRows.length,
    confirmed: memberRows.filter((row) => row.confirmedAt).length,
    declined: memberRows.filter((row) => row.declinedAt).length,
    confirmRate: rate(
      memberRows.filter((row) => row.confirmedAt).length,
      memberRows.length,
    ),
  };

  /* ---- money ----------------------------------------------------------- */

  /*
   * Settled money is dated by the handover, not by the event: a file drawn in
   * November for October's evenings is November's outgoing, which is how the
   * company's own accountant sees it.
   */
  const settledRows = payoutRows.filter((row) => {
    const at = row.createdAt?.getTime() ?? 0;
    return at >= from && at <= to;
  });
  const settled = settledRows.reduce((sum, row) => sum + row.total, 0);
  const expenses = expenseRows.reduce((sum, row) => sum + row.amount, 0);
  const owedNow = ledger.reduce((sum, member) => sum + member.totalAmount, 0);

  const money: Insights['money'] = {
    settled,
    payouts: settledRows.length,
    owedNow,
    expenses,
    perEvent: eventRows.length ? settled / eventRows.length : null,
    perShift: shiftRows.length ? settled / shiftRows.length : null,
  };

  /* ---- issues ---------------------------------------------------------- */

  const resolvedIssues = issueRows.filter((row) => row.resolvedAt);
  const issueStats: Insights['issues'] = {
    total: issueRows.length,
    resolved: resolvedIssues.length,
    resolvedRate: rate(resolvedIssues.length, issueRows.length),
    medianMinutes: median(
      resolvedIssues
        .map((row) => {
          const opened = row.createdAt?.getTime();
          const closed = row.resolvedAt?.getTime();
          if (!opened || !closed || closed < opened) return null;
          return Math.round((closed - opened) / 60_000);
        })
        .filter((minutes): minutes is number => minutes !== null),
    ),
    byType: counted(issueRows.map((row) => row.type)).slice(0, 6),
  };

  /* ---- feedback -------------------------------------------------------- */

  const ratings = feedbackRows.map((row) => row.rating);
  const feedback: Insights['feedback'] = {
    responses: ratings.length,
    averageRating: ratings.length
      ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length
      : null,
    responseRate: rate(ratings.length, judged.length),
  };

  /* ---- the shape over time --------------------------------------------- */

  const monthly = new Map<string, MonthPoint>();
  const monthOf = (date: string) => date.slice(0, 7);
  const touch = (month: string) => {
    const point = monthly.get(month) ?? { month, events: 0, shifts: 0, wages: 0 };
    monthly.set(month, point);
    return point;
  };

  for (const row of eventRows) touch(monthOf(row.date)).events += 1;
  const eventMonth = new Map(eventRows.map((row) => [row.id, monthOf(row.date)]));
  for (const row of shiftRows) {
    const month = eventMonth.get(row.eventId);
    if (month) touch(month).shifts += 1;
  }
  for (const row of settledRows) {
    if (!row.createdAt) continue;
    touch(row.createdAt.toISOString().slice(0, 7)).wages += row.total;
  }

  return {
    range,
    generatedAt: new Date(),
    events: eventStats,
    people,
    attendance: attendanceStats,
    invitations,
    money,
    issues: issueStats,
    feedback,
    months: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

/** Re-exported so callers do not have to know where the worked set lives. */
export { WORKED_STATUSES };
