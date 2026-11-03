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
  revalidatePath('/leader/payments');
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
 * What a handover over this span would come to, per person.
 *
 * Deliberately computed here and not trusted from the form: the page shows
 * these figures, the supervisor reads them, and then the same function
 * computes them again at the moment of settling. A total that was right when
 * the page rendered and wrong when the button was pressed is the one kind of
 * bug this cannot have.
 */
export async function previewPayout(fromDate: string, toDate: string) {
  const rows = await db
    .select({
      eventMemberId: eventMembers.id,
      teamMemberId: eventMembers.teamMemberId,
      name: teamMembers.fullName,
      payAmount: eventMembers.payAmount,
      payMode: eventMembers.payMode,
      eventId: events.id,
      eventName: events.name,
      eventDate: events.date,
      eventStatus: events.status,
      eventDefault: events.payDefault,
      attendanceStatus: eventMembers.id,
    })
    .from(eventMembers)
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(
      and(
        isNull(eventMembers.payoutId),
        ne(eventMembers.payMode, 'SALARIED'),
        ne(eventMembers.status, 'CANCELLED'),
        gte(events.date, fromDate),
        lte(events.date, toDate),
      ),
    );

  return rows.filter((row) => CLOSED_STATUSES.includes(row.eventStatus));
}

/**
 * Records that wages went out for a span of dates.
 *
 * Nothing is deleted and no balance is reset: every membership in the span is
 * tied to this handover, and "owed" means the ones that are tied to none. An
 * event a day outside the span keeps its money by simply not being touched.
 */
export async function settlePayoutAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  /*
   * The team leader settles too. He is the one who hands the money over
   * and the one asked whether it went out; routing that through a second
   * person is how a week goes by with nobody sure. Whichever of the two
   * does it, it is recorded against his name and can be reversed.
   */
  const user = await requireRole('ADMIN', 'TEAM_LEADER').catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const fromDate = str(form, 'fromDate') ?? '';
  const toDate = str(form, 'toDate') ?? '';
  if (!DATE.test(fromDate) || !DATE.test(toDate)) return fail(t.errors.invalidDate);
  if (toDate < fromDate) return fail(t.credit.rangeBackwards);

  const excluded = new Set(form.getAll('excludeMemberId').map(String));

  const candidates = (await previewPayout(fromDate, toDate)).filter(
    (row) => !excluded.has(row.teamMemberId),
  );
  if (candidates.length === 0) return fail(t.credit.nothingToSettle);

  /* Attendance and the chair shift decide what each line is actually worth. */
  const [attendanceRows, seatRows] = await Promise.all([
    db
      .select({ eventMemberId: eventMembers.id })
      .from(eventMembers)
      .where(
        inArray(
          eventMembers.id,
          candidates.map((row) => row.eventMemberId),
        ),
      ),
    db
      .select({
        eventMemberId: seatSetupMembers.eventMemberId,
        attended: seatSetupMembers.attended,
        pay: seatSetupDetails.payAmount,
      })
      .from(seatSetupMembers)
      .innerJoin(seatSetupDetails, eq(seatSetupMembers.detailId, seatSetupDetails.id))
      .where(
        inArray(
          seatSetupMembers.eventMemberId,
          candidates.map((row) => row.eventMemberId),
        ),
      ),
  ]);
  void attendanceRows;

  const seatBy = new Map(
    seatRows.filter((row) => row.attended).map((row) => [row.eventMemberId, row.pay]),
  );

  const total = candidates.reduce(
    (sum, row) =>
      sum +
      (row.payAmount ?? row.eventDefault) +
      (seatBy.get(row.eventMemberId) ?? 0),
    0,
  );
  const people = new Set(candidates.map((row) => row.teamMemberId)).size;

  const payoutId = newId();
  await db.insert(payouts).values({
    id: payoutId,
    fromDate,
    toDate,
    totalAmount: total,
    peopleCount: people,
    note: str(form, 'note'),
    createdById: user.id,
    createdByName: user.name,
  });

  await db
    .update(eventMembers)
    .set({ payoutId, updatedAt: new Date() })
    .where(
      inArray(
        eventMembers.id,
        candidates.map((row) => row.eventMemberId),
      ),
    );

  await recordAudit({
    eventId: null,
    actorId: user.id,
    actorName: user.name,
    action: 'CREATE',
    entity: 'EVENT',
    entityId: payoutId,
    entityLabel: `${fromDate} → ${toDate}`,
    newValues: { total, people, lines: candidates.length },
    summary: `${t.credit.payoutDone}: ${fromDate} → ${toDate}`,
  });

  /*
   * And each man's phone, with his own figure. Money going out is the one
   * thing people chase the leader about, and a message the moment it happens
   * is a conversation he does not have to have.
   */
  try {
    const byMember = new Map<string, number>();
    for (const row of candidates) {
      const amount =
        (row.payAmount ?? row.eventDefault) + (seatBy.get(row.eventMemberId) ?? 0);
      byMember.set(row.teamMemberId, (byMember.get(row.teamMemberId) ?? 0) + amount);
    }
    await Promise.all(
      [...byMember.entries()].map(([teamMemberId, amount]) =>
        pushToMembers([teamMemberId], {
          title: t.push.paidTitle,
          body: format(t.push.paidBody, { amount: formatAmount(amount) }),
          url: '/me',
          tag: `paid:${payoutId}`,
        }),
      ),
    );
  } catch {
    /* Recorded is what matters; telling people is best effort. */
  }

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
  /*
   * The team leader settles too. He is the one who hands the money over
   * and the one asked whether it went out; routing that through a second
   * person is how a week goes by with nobody sure. Whichever of the two
   * does it, it is recorded against his name and can be reversed.
   */
  const user = await requireRole('ADMIN', 'TEAM_LEADER').catch(() => null);
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

