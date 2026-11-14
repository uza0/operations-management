'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { eventRequests, venues } from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { str } from '@/lib/validation';
import { assertRole } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';

import { fail, ok, type ActionState } from './types';

/** A link we are willing to store and later open: https, no credentials in it. */
function cleanLink(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function refresh() {
  revalidatePath('/maps');
  revalidatePath('/admin/events');
  revalidatePath('/admin');
}

/**
 * The map editor files an evening: its name and its seats.io link, and if he
 * has them, a date and a venue. That is everything he can do here — what
 * becomes of it is the admin's.
 */
export async function submitEventRequestAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  let user;
  try {
    user = await assertRole('MAP_EDITOR', 'ADMIN');
  } catch {
    return fail(t.errors.forbidden);
  }

  const name = (str(form, 'name') ?? '').trim().slice(0, 160);
  if (!name) return fail(t.mapDesk.nameRequired);
  const seatsUrl = cleanLink(str(form, 'seatsUrl'));
  if (!seatsUrl) return fail(t.mapDesk.linkInvalid);

  const rawDate = str(form, 'date');
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
  if (rawDate && !date) return fail(t.errors.invalidDate);

  const venueId = str(form, 'venueId') || null;
  if (venueId) {
    const venue = await db.query.venues.findFirst({ where: eq(venues.id, venueId) });
    if (!venue) return fail(t.errors.notFound);
  }

  const id = newId();
  await db.insert(eventRequests).values({
    id,
    name,
    seatsUrl,
    date,
    venueId,
    status: 'PENDING',
    createdById: user.id,
    createdByName: user.name,
  });
  await recordAudit({
    actorId: user.id,
    actorName: user.name,
    action: 'CREATE',
    entity: 'EVENT_REQUEST',
    entityId: id,
    entityLabel: name,
    newValues: { seatsUrl, date, venueId },
    summary: `${t.mapDesk.auditFiled}: ${name}`,
  });

  refresh();
  return ok(t.mapDesk.sent);
}

/** Takes back one of his own that is still waiting, or clears one the admin set aside. */
export async function withdrawEventRequestAction(form: FormData): Promise<void> {
  let user;
  try {
    user = await assertRole('MAP_EDITOR', 'ADMIN');
  } catch {
    return;
  }
  const id = str(form, 'requestId');
  if (!id) return;
  const row = await db.query.eventRequests.findFirst({ where: eq(eventRequests.id, id) });
  /*
   * Waiting, or set aside by the admin: both are his to clear away. One the
   * admin approved is an event now and stays as the record of it.
   */
  if (!row || (row.status !== 'PENDING' && row.status !== 'DISMISSED')) return;
  // His own only; an admin may clear anybody's.
  if (user.role !== 'ADMIN' && row.createdById !== user.id) return;
  await db
    .delete(eventRequests)
    .where(and(eq(eventRequests.id, id), inArray(eventRequests.status, ['PENDING', 'DISMISSED'])));
  refresh();
}

/** The admin setting one aside without making an event of it. */
export async function dismissEventRequestAction(form: FormData): Promise<void> {
  const { t } = await getT();
  let user;
  try {
    user = await assertRole('ADMIN');
  } catch {
    return;
  }
  const id = str(form, 'requestId');
  if (!id) return;
  const row = await db.query.eventRequests.findFirst({ where: eq(eventRequests.id, id) });
  if (!row || row.status !== 'PENDING') return;
  await db
    .update(eventRequests)
    .set({ status: 'DISMISSED', updatedAt: new Date() })
    .where(eq(eventRequests.id, id));
  await recordAudit({
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'EVENT_REQUEST',
    entityId: id,
    entityLabel: row.name,
    newValues: { status: 'DISMISSED' },
    summary: `${t.mapDesk.auditDismissed}: ${row.name}`,
  });
  refresh();
}
