import 'server-only';

import { and, eq, gte, inArray, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { eventMembers, events } from '@/db/schema';
import { teamMembers } from '@/db/schema';

/**
 * Putting a person's rate into effect.
 *
 * The rate lives on the person, and every invitation copies it. That copy is
 * the whole point — an event that has already been paid out must keep the
 * figure it was paid at — but it is also the trap: changing the rate on the
 * person used to leave every invitation already sent still carrying the old
 * number, so a man told he was on forty opened his link and read thirty.
 *
 * So a rate change is not a write to one column. It is this: the standing
 * figure on the person, and the same figure copied onto every event he is on
 * that this system has not yet handed money over for. What it never touches
 * is a membership already attached to a payout.
 *
 * Both ways of setting a rate come through here — the quick edit on the
 * member, which applies to everything outstanding, and the dated correction
 * on his ledger, which applies from a day the supervisor types.
 */
export async function applyStandingRate(input: {
  teamMemberId: string;
  /** Dinars per event. Ignored when `salaried` — a salaried man has no rate. */
  amount: number | null;
  /** On a monthly contract with the company: this ledger owes him nothing. */
  salaried: boolean;
  /** 'ALL' for every outstanding event, or 'YYYY-MM-DD' for events from then. */
  from: 'ALL' | string;
}): Promise<{ touched: number }> {
  const now = new Date();

  await db
    .update(teamMembers)
    .set({
      salaried: input.salaried,
      defaultPay: input.salaried ? null : input.amount,
      updatedAt: now,
    })
    .where(eq(teamMembers.id, input.teamMemberId));

  const conditions = [
    eq(eventMembers.teamMemberId, input.teamMemberId),
    isNull(eventMembers.payoutId),
  ];
  if (input.from !== 'ALL') conditions.push(gte(events.date, input.from));

  const affected = await db
    .select({ id: eventMembers.id })
    .from(eventMembers)
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .where(and(...conditions));

  if (affected.length === 0) return { touched: 0 };

  await db
    .update(eventMembers)
    .set({
      /*
       * Both columns, together. A man who comes off a monthly contract needs
       * the figure put back as well as the mode, and a man who goes onto one
       * needs the figure taken away as well — half of this written and the
       * other half left behind is how a salaried man shows up owed 40,000.
       */
      payMode: input.salaried ? 'SALARIED' : 'EVENT',
      payAmount: input.salaried ? null : input.amount,
      updatedAt: now,
    })
    .where(
      inArray(
        eventMembers.id,
        affected.map((row) => row.id),
      ),
    );

  return { touched: affected.length };
}
