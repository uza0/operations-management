'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventMembers, events, teamMembers } from '@/db/schema';
import { SALES_ROLES, type SalesRole } from '@/lib/constants';
import { getT } from '@/lib/i18n/server';
import { assertRole } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';
import { fail, ok, type ActionState } from './types';

/** Save the match-only sales duty and its rate on this event membership. */
export async function saveSalesAssignmentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const eventMemberId = String(form.get('eventMemberId') ?? '');
  const rawRole = String(form.get('salesRole') ?? '');
  const role = (SALES_ROLES as readonly string[]).includes(rawRole)
    ? (rawRole as SalesRole)
    : null;

  let user;
  try {
    user = await assertRole('ADMIN');
  } catch {
    return fail(t.errors.forbidden);
  }

  const [event, member] = await Promise.all([
    db.query.events.findFirst({ where: eq(events.id, eventId) }),
    db
      .select({
        id: eventMembers.id,
        eventId: eventMembers.eventId,
        salesRole: eventMembers.salesRole,
        payAmount: eventMembers.payAmount,
        payMode: eventMembers.payMode,
        defaultPay: teamMembers.defaultPay,
        salaried: teamMembers.salaried,
        name: teamMembers.fullName,
      })
      .from(eventMembers)
      .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
      .where(eq(eventMembers.id, eventMemberId))
      .get(),
  ]);
  if (!event || !member || member.eventId !== eventId) return fail(t.errors.notFound);
  if (event.type !== 'FOOTBALL_MATCH') return fail(t.errors.forbidden);

  const amountText = String(form.get('payAmount') ?? '').trim();
  let payAmount: number | null = null;
  if (role && role !== 'SALES_SUPPORT') {
    if (amountText) {
      const amount = Number(amountText.replaceAll(',', ''));
      if (!Number.isInteger(amount) || amount < 0 || amount > 1_000_000) {
        return fail(t.errors.generic);
      }
      payAmount = amount;
    } else {
      payAmount = role === 'SALES_EMPLOYEE' ? 35_000 : 50_000;
    }
  } else if (!role) {
    payAmount = member.salaried ? null : (member.defaultPay ?? null);
  }

  await db
    .update(eventMembers)
    .set({
      salesRole: role,
      payMode: role && role !== 'SALES_SUPPORT'
        ? 'EVENT'
        : !role
          ? (member.salaried ? 'SALARIED' : 'EVENT')
          : member.payMode,
      ...(role === 'SALES_SUPPORT' ? {} : { payAmount }),
      updatedAt: new Date(),
    })
    .where(and(eq(eventMembers.id, eventMemberId), eq(eventMembers.eventId, eventId)));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'EVENT_MEMBER',
    entityId: eventMemberId,
    entityLabel: member.name,
    oldValues: { salesRole: member.salesRole, payAmount: member.payAmount },
    newValues: { salesRole: role, payAmount },
    summary: `${member.name}: ${role ?? 'sales role cleared'}`,
  });

  revalidatePath(`/admin/events/${eventId}/team`);
  revalidatePath('/admin/payment-file');
  return ok();
}
