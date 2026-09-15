'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { eventMembers, teamMembers } from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { assertEventManager } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';

import { fail, ok, type ActionState } from './types';

/**
 * Records that a member was sent their briefing.
 *
 * The sending itself happens in WhatsApp, on the organiser's own phone or
 * laptop — this is the part the system can actually know about: who was told,
 * when, and by whom. Kept honest on purpose: it says "a message was opened for
 * this person", which is why the button that triggers it is the same button
 * that opens the chat.
 */
export async function markBriefedAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  let user;
  try {
    user = await assertEventManager(eventId);
  } catch {
    return fail(t.errors.forbidden);
  }

  const ids = form.getAll('eventMemberIds').map(String).filter(Boolean);
  if (ids.length === 0) return fail(t.errors.required);

  const rows = await db
    .select({ id: eventMembers.id, name: teamMembers.fullName })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(and(eq(eventMembers.eventId, eventId), inArray(eventMembers.id, ids)));

  if (rows.length === 0) return fail(t.errors.notFound);

  await db
    .update(eventMembers)
    .set({ notifiedAt: new Date(), notifiedById: user.id, updatedAt: new Date() })
    .where(and(eq(eventMembers.eventId, eventId), inArray(eventMembers.id, ids)));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'ANNOUNCE',
    entity: 'EVENT_MEMBER',
    entityId: rows.length === 1 ? rows[0].id : null,
    entityLabel: rows.length === 1 ? rows[0].name : `${rows.length}`,
    summary:
      rows.length === 1
        ? `${t.notify.title}: ${rows[0].name}`
        : `${t.notify.title}: ${rows.length}`,
  });

  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${eventId}/notify`);
    revalidatePath(`${base}/events/${eventId}/team`);
  }
  return ok();
}

/** Clears the briefing marks, so a whole event can be briefed again from zero. */
export async function resetBriefingsAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  let user;
  try {
    user = await assertEventManager(eventId);
  } catch {
    return fail(t.errors.forbidden);
  }

  await db
    .update(eventMembers)
    .set({ notifiedAt: null, notifiedById: null, updatedAt: new Date() })
    .where(eq(eventMembers.eventId, eventId));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'EVENT_MEMBER',
    summary: `${t.notify.title} — ${t.common.reset}`,
  });

  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${eventId}/notify`);
  }
  return ok();
}
