'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, gte, gt, inArray, isNotNull, isNull, lte, ne } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventExpenses,
  events,
  eventMembers,
  paymentTemplates,
  payouts,
  seatSetupDetails,
  seatSetupMembers,
  teamMembers,
} from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { str } from '@/lib/validation';
import { format } from '@/lib/i18n';
import { formatAmount } from '@/lib/money';
import { isValidDate } from '@/lib/time';
import { requireRole } from '@/server/auth/rbac';
import { EXPENSE_ACCOUNT, expenseAccount, writeSetting } from '@/server/services/settings';
import { pushToMembers } from '@/server/services/push';
import { recordAudit } from '@/server/services/audit';
import { CLOSED_STATUSES, EXPENSE_PAYABLE_STATUSES } from '@/server/services/credit';
import {
  activeTemplate,
  blockers,
  buildHandover,
  collect,
  companyRegister,
  detachedSeatEvents,
  hasPaidChairDays,
  preparePromoterRegister,
  sharedAccounts,
  seatDetachCandidates,
  stampBundle,
} from '@/server/services/payment-file';
import { repairComputedTable } from '@/server/services/xlsx-template';

import { fail, ok, type ActionState } from './types';

/**
 * The company's weekly payment file.
 *
 * Every week the company hands the team leader a workbook, he fills in who
 * worked and what the evenings cost, and the money moves on what it says.
 * Everything in it is already here, so the filling is done from here and the
 * leader's job goes back to reading it before he sends it.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEMPLATE = 8 * 1024 * 1024;

function revalidate() {
  revalidatePath('/admin/payments');
  revalidatePath('/admin/credits');
  revalidatePath('/admin/settings');
  revalidatePath('/me');
}

function validDate(value: string) {
  return isValidDate(value);
}

/** Date-range search is admin-only because it reveals individual pay. */
export async function listSeatDetachCandidatesAction(from: string, to: string) {
  await requireRole('ADMIN');
  if (!validDate(from) || !validDate(to) || to < from) return [];
  return seatDetachCandidates({ from, to });
}

/** Events whose chair earnings have been detached, with their remaining balance. */
export async function listDetachedSeatEventsAction() {
  await requireRole('ADMIN');
  return detachedSeatEvents();
}

export async function detachSeatPayAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const user = await requireRole('ADMIN').catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const eventId = str(form, 'eventId') ?? '';
  const reason = (str(form, 'reason') ?? '').trim();
  if (!eventId || reason.length < 5) return fail(t.payment.detachReasonRequired);
  if (reason.length > 1000) return fail(t.payment.detachReasonTooLong);

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    columns: { id: true, name: true, seatPayDetachedAt: true },
  });
  if (!event) return fail(t.errors.notFound);
  if (event.seatPayDetachedAt) return fail(t.payment.detachAlready);

  const payable = await db
    .select({ id: seatSetupMembers.id })
    .from(seatSetupMembers)
    .innerJoin(seatSetupDetails, eq(seatSetupMembers.detailId, seatSetupDetails.id))
    .innerJoin(eventMembers, eq(seatSetupMembers.eventMemberId, eventMembers.id))
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(
      and(
        eq(seatSetupDetails.eventId, eventId),
        eq(seatSetupMembers.attended, true),
        isNull(seatSetupMembers.declinedAt),
        isNull(seatSetupMembers.payoutId),
        ne(eventMembers.status, 'CANCELLED'),
        eq(teamMembers.salaried, false),
        gt(seatSetupDetails.payAmount, 0),
      ),
    )
    .limit(1);
  if (payable.length === 0) return fail(t.payment.detachNothingPayable);

  const detachedAt = new Date();
  const updated = await db
    .update(events)
    .set({
      seatPayDetachedAt: detachedAt,
      seatPayDetachedBy: user.id,
      seatPayDetachedReason: reason,
      updatedAt: detachedAt,
    })
    .where(and(eq(events.id, eventId), isNull(events.seatPayDetachedAt)))
    .returning({ id: events.id });
  if (updated.length === 0) return fail(t.payment.detachAlready);

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'EVENT',
    entityId: eventId,
    entityLabel: event.name,
    newValues: { seatPayDetachedAt: detachedAt.toISOString(), reason },
    reason,
    summary: t.payment.detachAuditSummary,
  });

  revalidatePath(`/admin/events/${eventId}`);
  revalidate();
  return ok(t.payment.detachSuccess);
}

export async function undoSeatPayDetachAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const user = await requireRole('ADMIN').catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const eventId = str(form, 'eventId') ?? '';
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    columns: {
      id: true,
      name: true,
      seatPayDetachedAt: true,
      seatPayDetachedReason: true,
      status: true,
    },
  });
  if (!event?.seatPayDetachedAt) return fail(t.payment.detachNotActive);
  if (event.status === 'CANCELLED') return fail(t.event.cancelledNotice);

  if (await hasPaidChairDays(eventId)) return fail(t.payment.detachUndoBlocked);

  const updated = await db
    .update(events)
    .set({
      seatPayDetachedAt: null,
      seatPayDetachedBy: null,
      seatPayDetachedReason: null,
      updatedAt: new Date(),
    })
    .where(and(eq(events.id, eventId), isNotNull(events.seatPayDetachedAt)))
    .returning({ id: events.id });
  if (updated.length === 0) return fail(t.payment.detachNotActive);

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'EVENT',
    entityId: eventId,
    entityLabel: event.name,
    oldValues: { seatPayDetachedReason: event.seatPayDetachedReason },
    summary: t.payment.detachUndoAuditSummary,
  });

  revalidatePath(`/admin/events/${eventId}`);
  revalidate();
  return ok(t.payment.detachUndoSuccess);
}

/**
 * Stores the company's workbook as the thing we fill.
 *
 * Their form, not ours: a file they already trust, with their own checks tab
 * that will be run against our numbers by their own rules. That is the whole
 * reason for filling theirs instead of exporting something of our own.
 *
 * Their copy also arrives with parts of its own arithmetic typed over with
 * the figures those formulas produced on some evening months ago, so the
 * computed table is put back before the file is stored — and exactly what was
 * put back is recorded, because this is their sheet and not ours to change
 * quietly.
 */
export async function uploadTemplateAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const user = await requireRole('ADMIN').catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return fail(t.errors.required);
  if (file.size > MAX_TEMPLATE) return fail(t.payment.tooLarge);
  if (!file.name.toLowerCase().endsWith('.xlsx')) return fail(t.payment.notXlsx);

  const uploaded: Buffer<ArrayBuffer> = Buffer.from(await file.arrayBuffer());

  /* It has to be their workbook: the sheets we write must all be in it. */
  let repairs: { cell: string; was: string; now: string }[] = [];
  let bytes: Buffer<ArrayBuffer> = uploaded;
  try {
    const register = companyRegister(uploaded);
    if (register.size === 0) return fail(t.payment.noRegister);
    const repaired = repairComputedTable(uploaded, 'Dashboard', ['G', 'H', 'I', 'J', 'K']);
    bytes = repaired.buffer as Buffer<ArrayBuffer>;
    repairs = repaired.repairs;
  } catch {
    return fail(t.payment.unreadable);
  }

  const id = newId();
  await db.update(paymentTemplates).set({ active: false }).where(eq(paymentTemplates.active, true));
  await db.insert(paymentTemplates).values({
    id,
    fileName: file.name,
    bytes,
    size: bytes.length,
    active: true,
    uploadedById: user.id,
    uploadedByName: user.name,
  });

  await recordAudit({
    eventId: null,
    actorId: user.id,
    actorName: user.name,
    action: 'CREATE',
    entity: 'EVENT',
    entityId: id,
    entityLabel: file.name,
    newValues: { size: bytes.length, repairs: repairs.map((r) => r.cell) },
    summary: `${t.payment.templateUploaded}: ${file.name}`,
  });

  revalidate();
  return ok(
    repairs.length
      ? `${t.payment.templateUploaded} — ${t.payment.repaired.replace('{n}', String(repairs.length))}`
      : t.payment.templateUploaded,
  );
}

/** Update a promoter's account in the stored company register, never in a payout. */
/**
 * Builds this week's file and records that the money in it went out.
 *
 * Refuses rather than produces a file with holes in it. A row whose account
 * their register does not know gets no transfer and no warning from their
 * side either — it simply does not appear in their dashboard's total, and
 * nobody notices until a man asks where his money is. So anything that would
 * become such a row stops the whole file, named, before it is written.
 */
export async function generatePaymentFileAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const user = await requireRole('ADMIN').catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const fromDate = str(form, 'fromDate') ?? '';
  const toDate = str(form, 'toDate') ?? '';
  if (!DATE.test(fromDate) || !DATE.test(toDate)) return fail(t.errors.invalidDate);
  if (toDate < fromDate) return fail(t.credit.rangeBackwards);

  const row = await activeTemplate();
  if (!row) return fail(t.payment.noTemplate);
  const template = Buffer.from(row.bytes as Buffer);

  /*
   * Gathered again here rather than taken from the form. The page that showed
   * the figures was rendered at some earlier moment; an event closed since
   * then, or a cost was added, and the file must say what is true now.
   */
  const range = { from: fromDate, to: toDate };
  const bundle = await collect(range);
  if (bundle.fees.length === 0 && bundle.costs.length === 0) {
    return fail(t.credit.nothingToSettle);
  }

  const account = await expenseAccount();
  const prepared = preparePromoterRegister(template, bundle, account);
  const stops = blockers(bundle, prepared.register, account, prepared.conflicts);
  if (stops.length) return fail(`${t.payment.blocked}: ${stops.map((s) => s.label).join(' · ')}`);

  const handover = buildHandover(
    prepared.template,
    bundle,
    range,
    account,
    prepared.register,
  );

  /* Remember accounts already sent in a file, so later files do not add them again. */
  if (prepared.additions.length > 0) {
    await db
      .update(paymentTemplates)
      .set({
        bytes: prepared.template,
        size: prepared.template.length,
        updatedAt: new Date(),
      })
      .where(eq(paymentTemplates.id, row.id));
  }

  const payoutId = newId();
  await db.insert(payouts).values({
    id: payoutId,
    fromDate,
    toDate,
    totalAmount: handover.feesTotal,
    expensesTotal: handover.costsTotal,
    rowCount: handover.rowCount,
    peopleCount: handover.people,
    fileName: handover.fileName,
    fileBytes: handover.bytes,
    note: str(form, 'note'),
    createdById: user.id,
    createdByName: user.name,
  });

  /* Stamp the exact fee and cost lines the saved file contains. */
  await stampBundle(bundle, payoutId);

  await recordAudit({
    eventId: null,
    actorId: user.id,
    actorName: user.name,
    action: 'CREATE',
    entity: 'EVENT',
    entityId: payoutId,
    entityLabel: handover.fileName,
    newValues: {
      fees: handover.feesTotal,
      costs: handover.costsTotal,
      rows: handover.rowCount,
      people: handover.people,
      addedPromoters: prepared.additions.length,
    },
    summary: `${t.payment.generated}: ${fromDate} → ${toDate}`,
  });

  /*
   * And each man's phone, with his own figure on it.
   *
   * Not the file's total — his. The question this answers is "did mine go
   * out, and how much", and a message carrying somebody else's number
   * answers it wrongly for everybody.
   */
  try {
    const byMember = new Map<string, number>();
    const memberOf = await db
      .select({ id: eventMembers.id, teamMemberId: eventMembers.teamMemberId })
      .from(eventMembers)
      .where(
        inArray(
          eventMembers.id,
          bundle.fees.map((f) => f.eventMemberId),
        ),
      );
    const teamOf = new Map(memberOf.map((row) => [row.id, row.teamMemberId]));
    for (const fee of bundle.fees) {
      const team = teamOf.get(fee.eventMemberId);
      if (team) byMember.set(team, (byMember.get(team) ?? 0) + fee.amount);
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
    /* The money is recorded as gone out; telling people is best effort. */
  }

  revalidate();
  return ok(handover.fileName);
}

/** Past files, newest first — the answer to "what did we actually send". */
/**
 * Who the week's event costs are reimbursed to.
 *
 * One standing choice rather than a question every Sunday: the same man pays
 * for the scanner credit every night, and asking again each time is how it
 * ends up answered wrong on the week somebody else is covering.
 */
export async function setExpenseAccountAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const user = await requireRole('ADMIN').catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const id = str(form, 'memberId');
  if (id) {
    const member = await db.query.teamMembers.findFirst({
      where: eq(teamMembers.id, id),
      columns: { id: true, fullName: true, active: true },
    });
    if (!member || !member.active) return fail(t.errors.notFound);
  }

  await writeSetting(EXPENSE_ACCOUNT, id || null, user.id);
  await recordAudit({
    eventId: null,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'EVENT',
    entityId: EXPENSE_ACCOUNT,
    entityLabel: t.payment.expenseAccount,
    newValues: { memberId: id || null },
    summary: t.payment.expenseAccount,
  });

  revalidatePath('/admin/settings');
  revalidatePath('/admin/payments');
  return ok();
}

/** The people an expense transfer can be made out to: on the roster, with a card. */
export async function payableMembers() {
  await requireRole('ADMIN');
  return db
    .select({
      id: teamMembers.id,
      name: teamMembers.fullName,
      card: teamMembers.cardNumber,
    })
    .from(teamMembers)
    .where(eq(teamMembers.active, true))
    .orderBy(teamMembers.fullName)
    .all();
}

export async function listHandovers() {
  const user = await requireRole('ADMIN').catch(() => null);
  if (!user) return [];
  return db
    .select({
      id: payouts.id,
      fromDate: payouts.fromDate,
      toDate: payouts.toDate,
      totalAmount: payouts.totalAmount,
      expensesTotal: payouts.expensesTotal,
      rowCount: payouts.rowCount,
      peopleCount: payouts.peopleCount,
      fileName: payouts.fileName,
      note: payouts.note,
      createdByName: payouts.createdByName,
      createdAt: payouts.createdAt,
    })
    .from(payouts)
    .orderBy(desc(payouts.createdAt))
    .limit(60);
}

/** What is still unpaid outside any range, so a week is never skipped. */
export async function oldestOwed(): Promise<string | null> {
  const user = await requireRole('ADMIN').catch(() => null);
  if (!user) return null;
  const row = await db
    .select({ date: events.date })
    .from(eventMembers)
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .where(and(isNull(eventMembers.payoutId), inArray(events.status, CLOSED_STATUSES)))
    .orderBy(events.date)
    .limit(1)
    .get();
  const detached = await db
    .select({ date: seatSetupDetails.date })
    .from(seatSetupMembers)
    .innerJoin(seatSetupDetails, eq(seatSetupMembers.detailId, seatSetupDetails.id))
    .innerJoin(events, eq(seatSetupDetails.eventId, events.id))
    .innerJoin(eventMembers, eq(seatSetupMembers.eventMemberId, eventMembers.id))
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(
      and(
        isNotNull(events.seatPayDetachedAt),
        eq(seatSetupMembers.attended, true),
        isNull(seatSetupMembers.payoutId),
        isNull(seatSetupMembers.declinedAt),
        ne(eventMembers.status, 'CANCELLED'),
        eq(teamMembers.salaried, false),
        gt(seatSetupDetails.payAmount, 0),
      ),
    )
    .orderBy(seatSetupDetails.date)
    .limit(1)
    .get();
  const cost = await db.select({ date: events.date }).from(eventExpenses)
    .innerJoin(events, eq(eventExpenses.eventId, events.id))
    .where(and(isNull(eventExpenses.payoutId), inArray(events.status, EXPENSE_PAYABLE_STATUSES)))
    .orderBy(events.date).limit(1).get();
  const dates = [row?.date, detached?.date, cost?.date].filter((date): date is string => Boolean(date));
  return dates.sort()[0] ?? null;
}

export { gte, lte };
