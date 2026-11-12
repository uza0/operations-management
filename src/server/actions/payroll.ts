'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, gte, inArray, isNull, lte, ne } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventExpenses,
  eventMembers,
  events,
  memberRates,
  payouts,
  seatSetupDetails,
  seatSetupMembers,
  teamMembers,
} from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { format } from '@/lib/i18n';
import { formatAmount, MAX_EVENT_PAY } from '@/lib/money';
import { str } from '@/lib/validation';
import { CLOSED_STATUSES } from '@/server/services/credit';
import { applyStandingRate } from '@/server/services/rates';
import { requireRole } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';
import { pushToMembers } from '@/server/services/push';

import { fail, ok, type ActionState } from './types';

/**
 * Rates and wage handovers — the two things that decide what a person is
 * actually handed, and the two things nobody forgives a mistake in.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function revalidate() {
  revalidatePath('/admin/credits');
  revalidatePath('/admin/team');
  revalidatePath('/admin/payments');
}

/**
 * Sets a person's rate, from a date.
 *
 * The ordinary case is "from today", and it only touches what has not
 * happened yet. The other case is a correction: he has been on fifty since
 * the twelfth and three events have gone by at forty. Then the figure on
 * those events is put right too — deliberately, from a date the supervisor
 * types, with a line in the log saying how many events moved.
 *
 * What it will not touch is an event already paid out. That money has been
 * handed over; repricing it would mean the books disagree with what is in
 * people's pockets, and the fix for an underpayment that was already settled
 * is a correction everyone can see, not a number that quietly changes.
 */
export async function setMemberRateAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const user = await requireRole('ADMIN').catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const teamMemberId = str(form, 'teamMemberId');
  if (!teamMemberId) return fail(t.errors.notFound);

  const member = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.id, teamMemberId),
  });
  if (!member) return fail(t.errors.notFound);

  const raw = str(form, 'amount');
  const amount = raw === null ? null : Number(raw.replace(/[,\s]/g, ''));
  if (
    amount === null ||
    !Number.isFinite(amount) ||
    !Number.isInteger(amount) ||
    amount < 0 ||
    amount > MAX_EVENT_PAY
  ) {
    return fail(t.errors.invalidCredit);
  }

  const effectiveFrom = str(form, 'effectiveFrom') ?? '';
  if (!DATE.test(effectiveFrom)) return fail(t.errors.invalidDate);

  await db.insert(memberRates).values({
    id: newId(),
    teamMemberId,
    amount,
    effectiveFrom,
    note: str(form, 'note'),
    createdById: user.id,
    createdByName: user.name,
  });

  /*
   * Events from that date on, that this system still owes for. A membership
   * already attached to a payout is left exactly as it was. The copying
   * itself lives in one place — see applyStandingRate.
   */
  const affected = await applyStandingRate({
    teamMemberId,
    amount,
    salaried: member.salaried,
    from: effectiveFrom,
  });

  await recordAudit({
    eventId: null,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'TEAM_MEMBER',
    entityId: teamMemberId,
    entityLabel: member.fullName,
    oldValues: { defaultPay: member.defaultPay },
    newValues: { defaultPay: amount, effectiveFrom, events: affected.touched },
    summary: `${member.fullName}: ${amount} — ${effectiveFrom}`,
  });

  revalidate();
  return ok();
}

/**
 * Undoes a handover.
 *
 * Money is handed over by people, and people hand it over on the wrong dates.
 * Reversing one puts every line back to owed and leaves the record of both
 * the handover and its reversal in the log.
 */
export async function reversePayoutAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const user = await requireRole('ADMIN').catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const id = str(form, 'payoutId');
  if (!id) return fail(t.errors.notFound);

  const payout = await db.query.payouts.findFirst({ where: eq(payouts.id, id) });
  if (!payout) return fail(t.errors.notFound);

  await db
    .update(eventMembers)
    .set({ payoutId: null, updatedAt: new Date() })
    .where(eq(eventMembers.payoutId, id));
  /*
   * And the costs. A handover made from the payment file carries event costs
   * as well as wages; untying only the wages would leave those costs tied to
   * a handover that no longer exists, which is to say paid for ever.
   */
  await db
    .update(eventExpenses)
    .set({ payoutId: null, updatedAt: new Date() })
    .where(eq(eventExpenses.payoutId, id));
  await db.delete(payouts).where(eq(payouts.id, id));

  await recordAudit({
    eventId: null,
    actorId: user.id,
    actorName: user.name,
    action: 'DELETE',
    entity: 'EVENT',
    entityId: id,
    entityLabel: `${payout.fromDate} → ${payout.toDate}`,
    oldValues: { total: payout.totalAmount, people: payout.peopleCount },
    summary: `${t.credit.payoutReversed}: ${payout.fromDate} → ${payout.toDate}`,
  });

  revalidate();
  return ok();
}

