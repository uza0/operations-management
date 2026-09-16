import 'server-only';

import { and, eq, gte, inArray, lte } from 'drizzle-orm';

import { db } from '@/db';
import {
  assignments,
  attendance,
  eventMembers,
  events,
  gates,
  teamMembers,
  venues,
  workingPoints,
} from '@/db/schema';
import type { AttendanceStatus } from '@/lib/constants';

/**
 * Work credit — what a person is owed for an event, in days.
 *
 * The company pays by the day worked, so the number that matters at the end of
 * a month is not "how many events" but "how many days". Those are not the same
 * thing: a concert whose team comes in the morning before to lay out the
 * seating, then works the night itself, is two days for those people and one
 * for everyone else.
 *
 * So credit has exactly one rule, written here and nowhere else:
 *
 *   • someone who worked the event earns the event's default (normally 1)
 *   • someone marked absent earns nothing, excused or not
 *   • a number entered against a person wins over both — that is how the
 *     early set-up crew gets its extra day, and how a half shift gets a half
 *
 * "Worked" means present or late. Lateness is a timekeeping fact that belongs
 * in the report; it is not a pay cut the system applies on its own.
 */

/** Statuses that earn the event's default credit with no one intervening. */
export const WORKED_STATUSES: AttendanceStatus[] = ['PRESENT', 'LATE'];

export function creditFor(input: {
  status: AttendanceStatus | null;
  /** The person's own figure, or null to follow the event. */
  creditDays: number | null;
  eventDefault: number;
}): number {
  if (input.creditDays !== null && input.creditDays !== undefined) {
    return input.creditDays;
  }
  return input.status && WORKED_STATUSES.includes(input.status)
    ? input.eventDefault
    : 0;
}

/**
 * Credit is only final once the event is over. A LIVE event's attendance is
 * still being written, so its days are shown but never folded into a balance
 * the accounts department is meant to pay against.
 */
export const CLOSED_STATUSES = ['COMPLETED', 'ARCHIVED'];

export type LedgerLine = {
  eventId: string;
  eventName: string;
  eventDate: string;
  eventStatus: string;
  venueName: string | null;
  locationName: string | null;
  task: string | null;
  status: AttendanceStatus;
  checkInTime: string | null;
  checkOutTime: string | null;
  days: number;
  note: string | null;
  /** False while the event is still open — counted separately. */
  closed: boolean;
};

export type MemberLedger = {
  memberId: string;
  name: string;
  employeeCode: string;
  phone: string | null;
  active: boolean;
  lines: LedgerLine[];
  /** Days from events that are over — the figure payroll uses. */
  totalDays: number;
  /** Days from events still running, shown apart so nothing is paid early. */
  pendingDays: number;
  eventsWorked: number;
};

type Range = { from?: string; to?: string };

/** The raw rows behind every ledger: one per person per event they were on. */
async function ledgerRows(where: { memberIds?: string[]; range?: Range }) {
  const conditions = [];
  if (where.memberIds && where.memberIds.length > 0) {
    conditions.push(inArray(eventMembers.teamMemberId, where.memberIds));
  }
  if (where.range?.from) conditions.push(gte(events.date, where.range.from));
  if (where.range?.to) conditions.push(lte(events.date, where.range.to));

  return db
    .select({
      teamMemberId: eventMembers.teamMemberId,
      eventId: events.id,
      eventName: events.name,
      eventDate: events.date,
      eventStatus: events.status,
      eventDefault: events.creditDaysDefault,
      venueName: venues.name,
      memberStatus: eventMembers.status,
      creditDays: eventMembers.creditDays,
      creditNote: eventMembers.creditNote,
      status: attendance.status,
      checkInTime: attendance.checkInTime,
      checkOutTime: attendance.checkOutTime,
      gateName: gates.name,
      workingPointName: workingPoints.name,
      task: assignments.task,
    })
    .from(eventMembers)
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(attendance, eq(attendance.eventMemberId, eventMembers.id))
    .leftJoin(
      assignments,
      and(
        eq(assignments.eventMemberId, eventMembers.id),
        eq(assignments.status, 'ASSIGNED'),
      ),
    )
    .leftJoin(gates, eq(assignments.gateId, gates.id))
    .leftJoin(workingPoints, eq(assignments.workingPointId, workingPoints.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .all();
}

function toLine(row: Awaited<ReturnType<typeof ledgerRows>>[number]): LedgerLine {
  const status = (row.status ?? 'PENDING') as AttendanceStatus;
  return {
    eventId: row.eventId,
    eventName: row.eventName,
    eventDate: row.eventDate,
    eventStatus: row.eventStatus,
    venueName: row.venueName,
    locationName: row.gateName ?? row.workingPointName ?? null,
    task: row.task,
    status,
    checkInTime: row.checkInTime,
    checkOutTime: row.checkOutTime,
    days: creditFor({
      status,
      creditDays: row.creditDays,
      eventDefault: row.eventDefault,
    }),
    note: row.creditNote,
    closed: CLOSED_STATUSES.includes(row.eventStatus),
  };
}

function summarise(
  person: { id: string; fullName: string; employeeCode: string; phone: string | null; active: boolean },
  lines: LedgerLine[],
): MemberLedger {
  const sorted = [...lines].sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  return {
    memberId: person.id,
    name: person.fullName,
    employeeCode: person.employeeCode,
    phone: person.phone,
    active: person.active,
    lines: sorted,
    totalDays: sorted.filter((l) => l.closed).reduce((sum, l) => sum + l.days, 0),
    pendingDays: sorted.filter((l) => !l.closed).reduce((sum, l) => sum + l.days, 0),
    eventsWorked: sorted.filter((l) => l.closed && l.days > 0).length,
  };
}

/** One person's record: every event they were on, and what it was worth. */
export async function memberLedger(
  teamMemberId: string,
  range?: Range,
): Promise<MemberLedger | null> {
  const person = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.id, teamMemberId),
  });
  if (!person) return null;

  const rows = await ledgerRows({ memberIds: [teamMemberId], range });
  return summarise(person, rows.map(toLine));
}

/**
 * Everyone's record over a period — the payroll view.
 *
 * People who never worked in the window are included with a zero balance
 * rather than dropped: a payroll sheet that silently omits a name is worse
 * than one that shows a zero next to it.
 */
export async function payrollLedger(range?: Range): Promise<MemberLedger[]> {
  const people = await db.select().from(teamMembers).all();
  const rows = await ledgerRows({ range });

  const byMember = new Map<string, LedgerLine[]>();
  for (const row of rows) {
    const list = byMember.get(row.teamMemberId) ?? [];
    list.push(toLine(row));
    byMember.set(row.teamMemberId, list);
  }

  return people
    .map((person) => summarise(person, byMember.get(person.id) ?? []))
    .sort(
      (a, b) => b.totalDays - a.totalDays || a.employeeCode.localeCompare(b.employeeCode),
    );
}
