'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { events } from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { assertEventManager } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';
import { fail, ok, type ActionState } from './types';

export async function saveEventMapLinkAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventManager(eventId);
  const rawUrl = String(form.get('mapLinkUrl') ?? '').trim();

  if (!rawUrl || rawUrl.length > 2048) return fail(t.map.invalidLink);
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return fail(t.map.invalidLink);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return fail(t.map.invalidLink);
  }

  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!event) return fail(t.errors.notFound);

  await db
    .update(events)
    .set({
      mapImageUrl: null,
      mapDocumentUrl: null,
      mapLinkUrl: parsed.toString(),
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'EVENT',
    entityId: eventId,
    entityLabel: event.name,
    oldValues: {
      mapImageUrl: event.mapImageUrl,
      mapDocumentUrl: event.mapDocumentUrl,
      mapLinkUrl: event.mapLinkUrl,
    },
    newValues: { mapLinkUrl: parsed.toString() },
    summary: `تم تحديث رابط خريطة الفعالية: ${event.name}`,
  });

  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${eventId}/map`);
    revalidatePath(`${base}/events/${eventId}/assignments`);
  }
  return ok(t.map.linkSaved);
}
