'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventExpenses, eventMembers } from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { MAX_EVENT_PAY } from '@/lib/money';
import { str } from '@/lib/validation';
import { EXPENSE_CATEGORIES } from '@/lib/constants';
import { assertRole } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';

import { fail, ok, type ActionState } from './types';

/**
 * What the evening cost.
 *
 * Management-only, like every other screen with a figure on it: the team
 * leader who spent the money and the supervisor who answers for the budget.
 * A gate leader does not see it and a promoter has no idea it exists.
 */

function revalidate(eventId: string) {
  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${eventId}/expenses`);
    revalidatePath(`${base}/events/${eventId}/reports`);
    revalidatePath(`${base}/events/${eventId}`);
  }
}

/** Dinars, as somebody actually types them: "12,000" and "12000" both work. */
function readAmount(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw.replace(/[,\s]/g, ''));
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0 || n > MAX_EVENT_PAY * 100) {
    return null;
  }
  return n;
}

export async function saveExpenseAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertRole('ADMIN').catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const description = str(form, 'description');
  if (!description) return fail(t.errors.required);

  const amount = readAmount(str(form, 'amount'));
  if (amount === null) return fail(t.errors.invalidCredit);

  /*
   * Who the money went to, when it went to a person.
   *
   * Checked against this event's own roster rather than taken on trust: the
   * field decides which row of the company's payment file the sum lands on,
   * and a member id from another event would put somebody else's name beside
   * a transfer. Anything that is not on this roster is treated as a general
   * cost, which is what the field means when it is left alone.
   */
  const paidTo = str(form, 'teamMemberId');
  const teamMemberId = paidTo
    ? ((
        await db.query.eventMembers.findFirst({
          where: and(eq(eventMembers.eventId, eventId), eq(eventMembers.teamMemberId, paidTo)),
        })
      )?.teamMemberId ?? null)
    : null;

  const picked = str(form, 'category');
  const category =
    picked && (EXPENSE_CATEGORIES as readonly string[]).includes(picked) ? picked : 'OTHER';

  const id = str(form, 'id');
  if (id) {
    /* Edited in place, and only within the event it belongs to. */
    const existing = await db.query.eventExpenses.findFirst({
      where: and(eq(eventExpenses.id, id), eq(eventExpenses.eventId, eventId)),
    });
    if (!existing) return fail(t.errors.notFound);
    /*
     * A cost that has already gone out in a payment file is history. The
     * company has the figure; changing it here would leave our books saying
     * one thing and the transfer saying another. Reverse the handover first.
     */
    if (existing.payoutId) return fail(t.credit.alreadyPaid);

    await db
      .update(eventExpenses)
      .set({ category, description, amount, teamMemberId, updatedAt: new Date() })
      .where(eq(eventExpenses.id, id));

    await recordAudit({
      eventId,
      actorId: user.id,
      actorName: user.name,
      action: 'UPDATE',
      entity: 'EVENT',
      entityId: id,
      entityLabel: description,
      oldValues: { amount: existing.amount, teamMemberId: existing.teamMemberId },
      newValues: { amount, teamMemberId },
      summary: `${t.expense.title}: ${description} — ${amount}`,
    });
  } else {
    const newRow = newId();
    await db.insert(eventExpenses).values({
      id: newRow,
      eventId,
      category,
      description,
      amount,
      teamMemberId,
      createdById: user.id,
      createdByName: user.name,
    });

    await recordAudit({
      eventId,
      actorId: user.id,
      actorName: user.name,
      action: 'CREATE',
      entity: 'EVENT',
      entityId: newRow,
      entityLabel: description,
      newValues: { amount, category, teamMemberId },
      summary: `${t.expense.title}: ${description} — ${amount}`,
    });
  }

  revalidate(eventId);
  return ok();
}

export async function removeExpenseAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertRole('ADMIN').catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const id = str(form, 'id');
  if (!id) return fail(t.errors.notFound);

  const existing = await db.query.eventExpenses.findFirst({
    where: and(eq(eventExpenses.id, id), eq(eventExpenses.eventId, eventId)),
  });
  if (!existing) return fail(t.errors.notFound);
  if (existing.payoutId) return fail(t.credit.alreadyPaid);

  await db.delete(eventExpenses).where(eq(eventExpenses.id, id));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'DELETE',
    entity: 'EVENT',
    entityId: id,
    entityLabel: existing.description,
    oldValues: { amount: existing.amount },
    summary: `${t.expense.removed}: ${existing.description}`,
  });

  revalidate(eventId);
  return ok();
}
