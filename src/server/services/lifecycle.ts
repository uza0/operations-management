import 'server-only';

import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventAccess,
  eventExpenses,
  eventMembers,
  events,
  gates,
  teamMembers,
  users,
  workingPoints,
} from '@/db/schema';
import { recordAudit } from '@/server/services/audit';
import { pushOnce } from '@/server/services/push';
import { momentOfBaghdad } from '@/lib/time';
import { displayStage, endedAt } from '@/lib/event-stage';
import { unmarkedAttendance } from '@/server/services/seat-setup';
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
  return rows
    .filter((row) => displayStage(row, now) === 'NEEDS_CLOSING')
    .map((row) => ({ ...row, ...endedAt(row) }));
}

/**
 * Finished evenings whose record is finished too.
 *
 * This is the one transition a clock may not make on its own, and the reason
 * is in the closing itself: the moment an evening is COMPLETED every person
 * nobody marked becomes a zero and every person marked becomes money owed.
 * So the clock may only finish what a person already finished — if a single
 * name on the night or on the chair afternoon is still unmarked, the evening
 * stays open and somebody is told about it instead.
 */
export async function closable(now = Date.now()) {
  const over = await needsClosing(now);
  const checked = await Promise.all(
    over.map(async (row) => {
      const open = await unmarkedAttendance(row.id);
      return { row, open, clean: open.event.length === 0 && open.seats.length === 0 };
    }),
  );
  return checked;
}

/**
 * Moves every evening the clock and the ledger have already moved.
 *
 * Returns what it did rather than nothing, so whoever called it can say so:
 * a transition nobody can see is indistinguishable from a bug.
 */
export async function advanceEvents(now = Date.now()): Promise<Advance[]> {
  const [drafts, due, paid, over] = await Promise.all([
    draftsWithSomewhereToStand(),
    readyAndDue(now),
    paidInFull(),
    closable(now),
  ]);

  const moves: { ids: string[]; from: EventStatus; to: EventStatus }[] = [
    { ids: drafts, from: 'DRAFT', to: 'PLANNING' },
    { ids: due, from: 'READY', to: 'LIVE' },
    /* Only the nights whose attendance a person already finished. */
    { ids: over.filter((e) => e.clean).map((e) => e.row.id), from: 'LIVE', to: 'COMPLETED' },
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

/* -------------------------------------------------------------------------- */
/* nagging about the ones that cannot close                                   */
/* -------------------------------------------------------------------------- */

/**
 * The rungs of the ladder, in hours after the evening ended.
 *
 * Four of them, and the gaps widen on purpose. The first is a nudge while the
 * night is still in somebody's head; the last is three days of a man's money
 * standing still, and by then it is no longer the leader's problem alone.
 */
const LADDER = [
  { key: '2h', after: 2 },
  { key: '1d', after: 24 },
  { key: '3d', after: 72 },
  { key: '7d', after: 168 },
] as const;

export type ClosingNag = {
  eventId: string;
  name: string;
  /** Which rung this is, so the wording can get firmer. */
  rung: (typeof LADDER)[number]['key'];
  people: number;
  hours: number;
};

/**
 * Who has to hear that an evening will not close.
 *
 * The leaders of that event, because they are the ones who can mark the
 * names — and only those of them the system can actually reach on a phone,
 * which means a staff account linked to a crew record. Everybody else finds
 * out from the dashboard, which is where the supervisor is looking anyway.
 */
async function leadersOf(eventId: string): Promise<string[]> {
  const rows = await db
    .select({ teamMemberId: users.teamMemberId })
    .from(eventAccess)
    .innerJoin(users, eq(eventAccess.userId, users.id))
    .where(and(eq(eventAccess.eventId, eventId), isNull(eventAccess.gateId)))
    .all();
  return rows
    .map((row) => row.teamMemberId)
    .filter((id): id is string => Boolean(id));
}

/**
 * Tells whoever can fix it that an evening is still open, once per rung.
 *
 * Keyed by event and rung, so a sweep that runs forty times a day sends four
 * messages over a week rather than forty a day — the surest way to make a
 * reminder invisible is to repeat it.
 */
export async function nagAboutClosing(
  message: (nag: ClosingNag) => { title: string; body: string },
  now = Date.now(),
): Promise<ClosingNag[]> {
  const over = await closable(now);
  const sent: ClosingNag[] = [];

  for (const { row, open, clean } of over) {
    if (clean) continue;
    const hours = Math.floor((now - (row.ended + row.grace)) / (60 * 60 * 1000));
    const rung = [...LADDER].reverse().find((step) => hours >= step.after);
    if (!rung) continue;

    const nag: ClosingNag = {
      eventId: row.id,
      name: row.name,
      rung: rung.key,
      people: open.event.length + open.seats.length,
      hours,
    };
    const leaders = await leadersOf(row.id);
    if (leaders.length === 0) continue;

    const text = message(nag);
    const went = await pushOnce(`closing:${row.id}:${rung.key}`, leaders, {
      title: text.title,
      body: text.body,
      url: `/leader/events/${row.id}/attendance`,
      tag: `closing:${row.id}`,
    });
    if (went) sent.push(nag);
  }

  return sent;
}

/**
 * Checks one event's stage the moment something about it changed.
 *
 * The sweep is a backstop, not the mechanism. It runs on a schedule and on
 * whoever happens to open a page, which is fine for "the crew is due now"
 * and useless for "a gate was just added" — the supervisor is looking at the
 * screen that should already have changed, and a stage that arrives ten
 * minutes later reads as a bug whether or not it is one.
 *
 * So the one rule that is about an edit rather than about the clock is
 * evaluated at the edit. Safe to call from anywhere and cheap when there is
 * nothing to do: an event that is not a draft is one query and no write.
 */
export async function promoteIfBuilt(eventId: string): Promise<boolean> {
  const row = await db
    .select({ id: events.id, name: events.name, status: events.status })
    .from(events)
    .where(eq(events.id, eventId))
    .get();
  if (!row || row.status !== 'DRAFT') return false;

  const somewhere = await draftsWithSomewhereToStand();
  if (!somewhere.includes(eventId)) return false;

  await db
    .update(events)
    .set({ status: 'PLANNING', updatedAt: new Date() })
    .where(and(eq(events.id, eventId), eq(events.status, 'DRAFT')));

  await recordAudit({
    eventId,
    actorId: null,
    actorName: SYSTEM_ACTOR,
    action: 'STATUS_CHANGE',
    entity: 'EVENT',
    entityId: eventId,
    entityLabel: row.name,
    oldValues: { status: 'DRAFT' },
    newValues: { status: 'PLANNING' },
    summary: `${row.name}: DRAFT → PLANNING`,
  });
  return true;
}
