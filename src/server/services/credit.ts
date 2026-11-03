import 'server-only';

import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';

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
import { SEAT_SETUP_PAY } from '@/lib/money';
import type { AttendanceStatus } from '@/lib/constants';

/**
 * Work credit — what a person is owed for an event, in Iraqi dinars.
 *
 * The company pays by the event, not by the hour or the day: a promoter who
 * works an evening earns that event's rate, and the number that matters at the
 * end of a month is the sum of those rates. Most people are on the same rate,
 * and a handful are not — a gate leader, someone who also came the day before
 * to lay out the hall — so the rate lives in two places and only two:
 *
 *   • the event carries the figure everyone starts from (30,000 by default)
 *   • a person can be put on their own figure for that event
 *
 * Credit then has exactly one rule, written here and nowhere else:
 *
 *   • someone who worked the event earns the event's rate
 *   • someone marked absent earns nothing, excused or not
 *   • a figure entered against a person wins over both
 *
 * "Worked" means present or late. Lateness is a timekeeping fact that belongs
 * in the report; it is not a pay cut the system applies on its own.
 */

/**
 * Credit is only final once the event is over. A LIVE event's attendance is
 * still being written, so its figure is shown but never folded into a balance
 * the accounts department is meant to pay against.
 */
export const CLOSED_STATUSES = ['COMPLETED', 'ARCHIVED'];

/**
 * What one person is on for one event, resolved from the three places the
 * answer can live.
 *
 * The figure is stamped onto the membership when the invitation goes out, and
 * that stamp is what a settled event is judged by for ever. But a stamp is
 * only as good as every code path that remembers to make one — and one of
 * them did not. Cloning last month's event copied the team and left the
 * figure null, so a man on forty was invited to the new match at the event's
 * own thirty, and a man on a monthly contract was invited at thirty too.
 *
 * So the stamp is no longer the only source. For an event this system has
 * not yet handed money over for, a missing stamp falls through to the rate
 * standing on the person today — which is the thing the supervisor actually
 * set, and the thing he expects to apply everywhere. Once the money has gone
 * out, the stamp alone decides, because the books have to agree with what is
 * in people's pockets.
 *
 * Order, for an unpaid event: the person's monthly contract beats everything;
 * then a figure set against this one event; then his standing rate; then the
 * event's own default.
 */
export function effectiveRate(input: {
  /** True once this membership went out in a handover. */
  paid: boolean;
  /** What the membership was stamped with. */
  payMode: string | null;
  payAmount: number | null;
  /** What the person is on today. */
  personSalaried?: boolean | null;
  personDefaultPay?: number | null;
  eventDefault: number;
}): number | null {
  if (input.paid) {
    return input.payMode === 'SALARIED' ? null : (input.payAmount ?? input.eventDefault);
  }

  if (input.payMode === 'SALARIED' || input.personSalaried) return null;

  return input.payAmount ?? input.personDefaultPay ?? input.eventDefault;
}

/** Statuses that earn the event's default credit with no one intervening. */
export const WORKED_STATUSES: AttendanceStatus[] = ['PRESENT', 'LATE'];

/**
 * What this system owes one person for one event.
 *
 * `null` is not zero. Zero is "worked nothing, earned nothing"; null is "not
 * this system's business" — the few people on a monthly contract with the
 * company, whose pay is settled elsewhere. Every caller has to say which of
 * the two it is showing, which is the point of returning null rather than a
 * harmless-looking 0.
 */
export function creditFor(input: {
  status: AttendanceStatus | null;
  /** The person's own figure, or null to follow the event. */
  payAmount: number | null;
  eventDefault: number;
  /** 'SALARIED' means the company pays them monthly; this ledger does not. */
  payMode?: string | null;
  /**
   * The event's own state. Before it is over there is nothing to judge yet,
   * so the answer is the rate — what he stands to earn. Once it is over the
   * answer is what he earned, which is nothing if he did not come.
   *
   * This distinction used to be absent, and it stopped mattering the day
   * every invitation started carrying the person's standing rate: a figure
   * was always present, the figure always won, and "someone marked absent
   * earns nothing" quietly became a sentence that was true in this comment
   * and nowhere in the code.
   */
  eventStatus?: string | null;
  /** True once this membership went out in a handover — see effectiveRate. */
  paid?: boolean;
  /** What the person is on today, for an event not yet paid out. */
  personSalaried?: boolean | null;
  personDefaultPay?: number | null;
}): number | null {
  const rate = effectiveRate({
    paid: input.paid ?? false,
    payMode: input.payMode ?? null,
    payAmount: input.payAmount,
    personSalaried: input.personSalaried,
    personDefaultPay: input.personDefaultPay,
    eventDefault: input.eventDefault,
  });
  if (rate === null) return null;

  const settled = input.eventStatus
    ? CLOSED_STATUSES.includes(input.eventStatus)
    : false;
  if (!settled) return rate;

  return input.status && WORKED_STATUSES.includes(input.status) ? rate : 0;
}

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
  /** null when the company pays this person monthly — see creditFor. */
  amount: number | null;
  /**
   * The flat fee for setting out the chairs the day before, when they were on
   * that crew and turned up. Kept beside the event's own figure rather than
   * folded into it: they are two days' work at two different rates, and a
   * single merged number is one nobody can check.
   */
  seatAmount: number | null;
  /** How many chair days that figure is, so it can be read rather than trusted. */
  seatDays: number;
  note: string | null;
  /** True once this line went out in a handover; it is no longer owed. */
  paid: boolean;
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
  /** Over, and not yet handed over — the figure payroll pays against. */
  totalAmount: number;
  /** From events still running, kept apart so nothing is paid early. */
  pendingAmount: number;
  /** Already handed over in an earlier settlement. */
  paidAmount: number;
  eventsWorked: number;
};

type Range = { from?: string; to?: string };

/** The raw rows behind every ledger: one per person per event they were on. */
async function ledgerRows(where: { memberIds?: string[]; range?: Range }) {
  /*
   * A draft owes nobody anything.
   *
   * It is an evening somebody is still building — the date moves, the names
   * on it come off again — so a figure against it is a promise the company
   * has not made. Leaving it in produced the worst of both: the event was
   * hidden from the man's page and its money was still sitting in "قيد
   * الاحتساب", a number with nothing behind it to explain it.
   *
   * Nothing settled can be caught by this. The only road back to a draft is
   * from planning, so a draft has never been worked, let alone paid.
   */
  const conditions = [ne(events.status, 'DRAFT')];
  if (where.memberIds && where.memberIds.length > 0) {
    conditions.push(inArray(eventMembers.teamMemberId, where.memberIds));
  }
  if (where.range?.from) conditions.push(gte(events.date, where.range.from));
  if (where.range?.to) conditions.push(lte(events.date, where.range.to));

  return db
    .select({
      teamMemberId: eventMembers.teamMemberId,
      eventMemberId: eventMembers.id,
      eventId: events.id,
      eventName: events.name,
      eventDate: events.date,
      eventStatus: events.status,
      eventDefault: events.payDefault,
      venueName: venues.name,
      memberStatus: eventMembers.status,
      payAmount: eventMembers.payAmount,
      payMode: eventMembers.payMode,
      payoutId: eventMembers.payoutId,
      personSalaried: teamMembers.salaried,
      personDefaultPay: teamMembers.defaultPay,
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
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
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

/**
 * What each person is owed for setting out chairs, per event membership.
 *
 * Summed in its own query rather than joined onto the ledger: a big event is
 * built over two or three days, and a join would hand back the event's own
 * line once per chair day and quietly pay it twice.
 */
type SeatPay = {
  /** Days he is down for and has not refused — what he can still expect. */
  expected: Map<string, number>;
  /** Days he was confirmed at — what he has actually earned. */
  earned: Map<string, number>;
  /*
   * And how many days each of those is.
   *
   * The money alone cannot answer the question people actually ask. A man
   * looking at ninety thousand for an evening he was paid thirty for wants to
   * know where the other sixty came from, and "two days of chairs" is the
   * answer. A single total is a number he has to take on trust.
   */
  expectedDays: Map<string, number>;
  earnedDays: Map<string, number>;
};

export async function seatPayByMember(): Promise<SeatPay> {
  const rows = await db
    .select({
      eventMemberId: seatSetupMembers.eventMemberId,
      pay: seatSetupDetails.payAmount,
      attended: seatSetupMembers.attended,
      declinedAt: seatSetupMembers.declinedAt,
    })
    .from(seatSetupMembers)
    .innerJoin(seatSetupDetails, eq(seatSetupMembers.detailId, seatSetupDetails.id));

  const expected = new Map<string, number>();
  const earned = new Map<string, number>();
  const expectedDays = new Map<string, number>();
  const earnedDays = new Map<string, number>();
  const add = (map: Map<string, number>, id: string, pay: number) =>
    map.set(id, (map.get(id) ?? 0) + pay);

  for (const row of rows) {
    const pay = row.pay ?? SEAT_SETUP_PAY;
    if (!row.declinedAt) {
      add(expected, row.eventMemberId, pay);
      add(expectedDays, row.eventMemberId, 1);
    }
    if (row.attended) {
      add(earned, row.eventMemberId, pay);
      add(earnedDays, row.eventMemberId, 1);
    }
  }
  return { expected, earned, expectedDays, earnedDays };
}

function toLine(
  row: Awaited<ReturnType<typeof ledgerRows>>[number],
  seatPay: SeatPay,
): LedgerLine {
  const status = (row.status ?? 'PENDING') as AttendanceStatus;
  const closed = CLOSED_STATUSES.includes(row.eventStatus);
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
    amount: creditFor({
      status,
      payAmount: row.payAmount,
      eventDefault: row.eventDefault,
      payMode: row.payMode,
      eventStatus: row.eventStatus,
      paid: row.payoutId !== null,
      personSalaried: row.personSalaried,
      personDefaultPay: row.personDefaultPay,
    }),
    /*
     * Salaried people are outside this ledger for the chairs too: the flat fee
     * is event pay by another name, and their pay is settled elsewhere.
     *
     * For everyone else the chair fee follows the same clock as the event's
     * own figure: while the event is still ahead this is what he can expect
     * for the days he is down for, and once it is over it is what he was
     * actually confirmed at. The two differed before, and that is why a
     * Thursday afternoon showed nothing at all in "قيد الاحتساب" — the
     * expected column was reading a fact that only exists afterwards.
     */
    seatAmount:
      row.payMode === 'SALARIED' || (row.payoutId === null && row.personSalaried)
        ? null
        : ((closed ? seatPay.earned : seatPay.expected).get(row.eventMemberId) ?? null),
    seatDays:
      (closed ? seatPay.earnedDays : seatPay.expectedDays).get(row.eventMemberId) ?? 0,
    note: row.creditNote,
    paid: row.payoutId !== null,
    closed,
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
    /* A null line is outside this ledger, so it adds nothing to either total. */
    /* Owed: the event is over and the money has not gone out yet. */
    totalAmount: sorted
      .filter((l) => l.closed && !l.paid)
      .reduce((sum, l) => sum + (l.amount ?? 0) + (l.seatAmount ?? 0), 0),
    pendingAmount: sorted
      .filter((l) => !l.closed)
      .reduce((sum, l) => sum + (l.amount ?? 0) + (l.seatAmount ?? 0), 0),
    /* Already handed over, and so no longer part of what is owed. */
    paidAmount: sorted
      .filter((l) => l.paid)
      .reduce((sum, l) => sum + (l.amount ?? 0) + (l.seatAmount ?? 0), 0),
    eventsWorked: sorted.filter((l) => l.closed && (l.amount ?? 0) > 0).length,
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

  const [rows, seatPay] = await Promise.all([
    ledgerRows({ memberIds: [teamMemberId], range }),
    seatPayByMember(),
  ]);
  return summarise(
    person,
    rows.map((row) => toLine(row, seatPay)),
  );
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
  const [rows, seatPay] = await Promise.all([ledgerRows({ range }), seatPayByMember()]);

  const byMember = new Map<string, LedgerLine[]>();
  for (const row of rows) {
    const list = byMember.get(row.teamMemberId) ?? [];
    list.push(toLine(row, seatPay));
    byMember.set(row.teamMemberId, list);
  }

  return people
    .map((person) => summarise(person, byMember.get(person.id) ?? []))
    .sort(
      (a, b) => b.totalAmount - a.totalAmount || a.employeeCode.localeCompare(b.employeeCode),
    );
}
