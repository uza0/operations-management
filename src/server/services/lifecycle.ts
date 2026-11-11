import 'server-only';

import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventExpenses,
  eventMembers,
  events,
  gates,
  teamMembers,
  workingPoints,
} from '@/db/schema';
import { recordAudit } from '@/server/services/audit';
import { momentOfBaghdad } from '@/lib/time';
import { displayStage } from '@/lib/event-stage';
import type { EventStatus } from '@/lib/constants';

/**
 * The stages an evening passes through on its own.
 *
 * Six of the stages were a dropdown somebody had to remember. Three of them
 * are not decisions at all — they are facts about the clock and the ledger,
 * and the only reason a person was setting them is that nothing else was.
 * So those three move by themselves and the other three stay where they
 * belong, in somebody's hands:
 *
 *   DRAFT → PLANNING is the evening ceasing to be an empty shell.
 *   READY → LIVE is the hour the crew is due on site.
 *   COMPLETED → ARCHIVED is the week's money having gone out.
 *
 * What is NOT here is the one that matters most. LIVE → COMPLETED is the
 * moment every unmarked person becomes a zero and every marked one becomes
 * money owed, so it is not a thing a clock may do alone; it arrives in its
 * own change, with the conditions that have to hold first.
 *
 * Nothing here ever moves an evening backwards, and nothing skips a stage.
 * An event still in planning when its crew is due is a problem to be shouted
 * about, not one to be quietly tidied away — see `overdueToReady`.
 */

/** The actor written into the log, so the record never claims a person did it. */
const SYSTEM_ACTOR = 'النظام';

export type Advance = {
  eventId: string;
  name: string;
  from: EventStatus;
  to: EventStatus;
};

/**
 * An evening stops being a draft when somebody has put a place in it.
 *
 * Venue, date and both clock times are required at creation, so the only
 * thing that separates a sketch from a plan is whether anywhere has been
 * named for people to stand. One gate — or one working point — and it is a
 * plan being built; none, and it is a line in a list.
 *
 * An event copied from a previous one passes this the instant it exists,
 * which is the right answer and not a special case: a copy arrives with last
 * time's gates already in it.
 */
async function draftsWithSomewhereToStand(): Promise<string[]> {
  const rows = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.status, 'DRAFT'),
        or(
          sql`exists (select 1 from ${gates} where ${gates.eventId} = ${events.id})`,
          sql`exists (select 1 from ${workingPoints} where ${workingPoints.eventId} = ${events.id})`,
        ),
      ),
    )
    .all();
  return rows.map((row) => row.id);
}

/**
 * Events whose crew is due now, and which somebody already called ready.
 *
 * The crew's arrival time rather than the event's own: the operation starts
 * when the first person reaches a gate, which is two or three hours before
 * the doors open. Keyed off READY alone, because an evening nobody declared
 * ready is not an evening to start by stealth.
 */
async function readyAndDue(now: number): Promise<string[]> {
  const rows = await db
    .select({ id: events.id, date: events.date, arrival: events.teamArrivalTime })
    .from(events)
    .where(eq(events.status, 'READY'))
    .all();
  return rows.filter((row) => momentOfBaghdad(row.date, row.arrival) <= now).map((row) => row.id);
}

/**
 * Finished evenings with nothing left owed on them.
 *
 * "Archived" has meant nothing in particular until now — a button somebody
 * pressed when they felt like it. What it should mean is that there is
 * nothing left to do with this night, and the last thing outstanding after a
 * night is always the money.
 *
 * A line counts as still owed when it is somebody's to be paid: not a
 * reserve who was never asked, not a membership that was cancelled, and not
 * one of the few people the company pays monthly, whose evenings never
 * appear in a payment file at all and would otherwise hold an event open
 * forever.
 */
async function paidInFull(): Promise<string[]> {
  const rows = await db
    .select({
      id: events.id,
      memberId: eventMembers.id,
      payoutId: eventMembers.payoutId,
      status: eventMembers.status,
      isReserve: eventMembers.isReserve,
      payMode: eventMembers.payMode,
      salaried: teamMembers.salaried,
    })
    .from(events)
    .leftJoin(eventMembers, eq(eventMembers.eventId, events.id))
    .leftJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(events.status, 'COMPLETED'))
    .all();

  const byEvent = new Map<string, { paid: number; owed: number }>();
  for (const row of rows) {
    const tally = byEvent.get(row.id) ?? { paid: 0, owed: 0 };
    byEvent.set(row.id, tally);
    if (!row.memberId) continue;
    const payable =
      !row.isReserve && row.status !== 'CANCELLED' && row.payMode !== 'SALARIED' && !row.salaried;
    if (!payable) continue;
    if (row.payoutId) tally.paid += 1;
    else tally.owed += 1;
  }

  /* A cost still untied to a handover holds the night open just as a wage does. */
  const openCosts = await db
    .select({ eventId: eventExpenses.eventId })
    .from(eventExpenses)
    .where(isNull(eventExpenses.payoutId))
    .all();
  const withOpenCosts = new Set(openCosts.map((row) => row.eventId));

  return [...byEvent.entries()]
    .filter(([id, t]) => t.paid > 0 && t.owed === 0 && !withOpenCosts.has(id))
    .map(([id]) => id);
}

/**
 * Evenings the clock has overtaken while nobody pressed anything.
 *
 * The crew is due and the event was never made ready, which means it was
 * never sent to them: nobody has been told where to be. This is the one
 * thing in the lifecycle a machine must not fix — moving it on would hand
 * the crew an evening they have had no notice of — so it is only ever
 * reported, loudly.
 */
export async function overdueToReady(now = Date.now()) {
  const rows = await db
    .select({
      id: events.id,
      name: events.name,
      date: events.date,
      arrival: events.teamArrivalTime,
      status: events.status,
    })
    .from(events)
    .where(inArray(events.status, ['DRAFT', 'PLANNING']))
    .all();
  return rows.filter((row) => momentOfBaghdad(row.date, row.arrival) <= now);
}

/**
 * Evenings that are over by the clock but whose record is not finished.
 *
 * Nothing is moved: the stored status stays LIVE, because a night with
 * unmarked attendance owes nobody anything yet and every figure in this
 * system depends on that staying true. What changes is what the screens
 * call it — a badge reading "جارية" three days after the hall emptied is
 * the dashboard repeating a lie all week.
 */
export async function needsClosing(now = Date.now()) {
  const rows = await db
    .select({
      id: events.id,
      name: events.name,
      status: events.status,
      date: events.date,
      startTime: events.startTime,
      teamDepartureTime: events.teamDepartureTime,
    })
    .from(events)
    .where(eq(events.status, 'LIVE'))
    .all();

  /* The same judgement the badge makes, so the two can never disagree. */
  return rows.filter((row) => displayStage(row, now) === 'NEEDS_CLOSING');
}

/**
 * Moves every evening the clock and the ledger have already moved.
 *
 * Returns what it did rather than nothing, so whoever called it can say so:
 * a transition nobody can see is indistinguishable from a bug.
 */
export async function advanceEvents(now = Date.now()): Promise<Advance[]> {
  const [drafts, due, paid] = await Promise.all([
    draftsWithSomewhereToStand(),
    readyAndDue(now),
    paidInFull(),
  ]);

  const moves: { ids: string[]; from: EventStatus; to: EventStatus }[] = [
    { ids: drafts, from: 'DRAFT', to: 'PLANNING' },
    { ids: due, from: 'READY', to: 'LIVE' },
    { ids: paid, from: 'COMPLETED', to: 'ARCHIVED' },
  ];

  const done: Advance[] = [];
  for (const move of moves) {
    if (move.ids.length === 0) continue;

    const named = await db
      .select({ id: events.id, name: events.name })
      .from(events)
      .where(and(inArray(events.id, move.ids), eq(events.status, move.from)))
      .all();
    if (named.length === 0) continue;

    /*
     * Guarded by the stage it is leaving as well as by its id: somebody may
     * have moved it by hand between the read above and this write, and the
     * one thing automation must never do is overrule a person.
     */
    await db
      .update(events)
      .set({ status: move.to, updatedAt: new Date() })
      .where(
        and(
          inArray(
            events.id,
            named.map((row) => row.id),
          ),
          eq(events.status, move.from),
        ),
      );

    for (const row of named) {
      await recordAudit({
        eventId: row.id,
        actorId: null,
        actorName: SYSTEM_ACTOR,
        action: 'STATUS_CHANGE',
        entity: 'EVENT',
        entityId: row.id,
        entityLabel: row.name,
        oldValues: { status: move.from },
        newValues: { status: move.to },
        summary: `${row.name}: ${move.from} → ${move.to}`,
      });
      done.push({ eventId: row.id, name: row.name, from: move.from, to: move.to });
    }
  }

  return done;
}
