'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';

import { db } from '@/db';
import { eventExpenses, events, eventMembers, paymentTemplates, payouts } from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { str } from '@/lib/validation';
import { format } from '@/lib/i18n';
import { formatAmount } from '@/lib/money';
import { requireRole } from '@/server/auth/rbac';
import { pushToMembers } from '@/server/services/push';
import { recordAudit } from '@/server/services/audit';
import { CLOSED_STATUSES } from '@/server/services/credit';
import {
  activeTemplate,
  blockers,
  buildHandover,
  collect,
  companyRegister,
  sharedAccounts,
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
  revalidatePath('/leader/payments');
  revalidatePath('/admin/credits');
  revalidatePath('/leader/credits');
  revalidatePath('/admin/settings');
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
  const user = await requireRole('ADMIN', 'TEAM_LEADER').catch(() => null);
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

  const stops = blockers(bundle, companyRegister(template));
  if (stops.length) return fail(`${t.payment.blocked}: ${stops.map((s) => s.label).join(' · ')}`);

  const handover = buildHandover(template, bundle, range);

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

  /*
   * The exact rows the file was built from, and no others. Re-deriving the
   * set here from the dates would stamp a row that was added in between and
   * is not in the file anybody is about to send.
   */
  await db
    .update(eventMembers)
    .set({ payoutId, updatedAt: new Date() })
    .where(
      inArray(
        eventMembers.id,
        bundle.fees.map((f) => f.eventMemberId),
      ),
    );
  if (bundle.costs.length) {
    await db
      .update(eventExpenses)
      .set({ payoutId, updatedAt: new Date() })
      .where(
        inArray(
          eventExpenses.id,
          bundle.costs.map((c) => c.id),
        ),
      );
  }

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
export async function listHandovers() {
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
  const row = await db
    .select({ date: events.date })
    .from(eventMembers)
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .where(and(isNull(eventMembers.payoutId), inArray(events.status, CLOSED_STATUSES)))
    .orderBy(events.date)
    .limit(1)
    .get();
  return row?.date ?? null;
}

export { gte, lte };
