'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { events, venues } from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { firstIssueKey, str, venueSchema } from '@/lib/validation';
import { assertRole } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';

import { fail, ok, type ActionState } from './types';

export async function saveVenueAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  let user;
  try {
    user = await assertRole('ADMIN');
  } catch {
    return fail(t.errors.forbidden);
  }

  const id = str(form, 'venueId');
  const parsed = venueSchema.safeParse({
    name: str(form, 'name') ?? '',
    address: str(form, 'address'),
    description: str(form, 'description'),
    locationUrl: str(form, 'locationUrl'),
    latitude: str(form, 'latitude') || null,
    longitude: str(form, 'longitude') || null,
  });
  if (!parsed.success) {
    const errors = t.errors as unknown as Record<string, string>;
    return fail(errors[firstIssueKey(parsed.error)] ?? t.errors.generic);
  }

  if (id) {
    const existing = await db.query.venues.findFirst({ where: eq(venues.id, id) });
    if (!existing) return fail(t.errors.notFound);
    await db
      .update(venues)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(venues.id, id));
    await recordAudit({
      actorId: user.id,
      actorName: user.name,
      action: 'UPDATE',
      entity: 'VENUE',
      entityId: id,
      entityLabel: parsed.data.name,
      oldValues: { name: existing.name },
      newValues: { name: parsed.data.name },
      summary: `${t.enums.auditAction.UPDATE}: ${parsed.data.name}`,
    });
  } else {
    const newVenueId = newId();
    await db.insert(venues).values({ id: newVenueId, ...parsed.data });
    await recordAudit({
      actorId: user.id,
      actorName: user.name,
      action: 'CREATE',
      entity: 'VENUE',
      entityId: newVenueId,
      entityLabel: parsed.data.name,
      newValues: { name: parsed.data.name },
      summary: `${t.enums.auditAction.CREATE}: ${parsed.data.name}`,
    });
  }

  revalidatePath('/admin/venues');
  return ok();
}

export async function deleteVenueAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  let user;
  try {
    user = await assertRole('ADMIN');
  } catch {
    return fail(t.errors.forbidden);
  }

  const id = str(form, 'venueId');
  if (!id) return fail(t.errors.notFound);

  const venue = await db.query.venues.findFirst({ where: eq(venues.id, id) });
  if (!venue) return fail(t.errors.notFound);

  // A venue with events keeps its history — deleting it would orphan them.
  const used = await db.$count(events, eq(events.venueId, id));
  if (used > 0) return fail(t.venue.deleteBlocked);

  await db.delete(venues).where(eq(venues.id, id));
  await recordAudit({
    actorId: user.id,
    actorName: user.name,
    action: 'DELETE',
    entity: 'VENUE',
    entityId: id,
    entityLabel: venue.name,
    summary: `${t.enums.auditAction.DELETE}: ${venue.name}`,
  });

  revalidatePath('/admin/venues');
  return ok();
}
