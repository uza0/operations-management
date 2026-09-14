'use server';

import { revalidatePath } from 'next/cache';
import { eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { mapMarkers } from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { markersPayloadSchema } from '@/lib/validation';
import { assertEventManager } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';

import { fail, ok, type ActionState } from './types';

export type MarkerInput = {
  id?: string;
  type: string;
  name: string;
  description: string | null;
  x: number;
  y: number;
  gateId: string | null;
  workingPointId: string | null;
  eventMemberId: string | null;
};

/**
 * Saves the whole marker layer in one transaction-like pass: rows the editor
 * no longer has are deleted, existing rows are updated, new ones inserted.
 * Coordinates are normalized (0..1) so the map renders correctly at any size.
 */
export async function saveMarkersAction(
  eventId: string,
  markers: MarkerInput[],
): Promise<ActionState> {
  const { t } = await getT();
  let user;
  try {
    user = await assertEventManager(eventId);
  } catch {
    return fail(t.errors.forbidden);
  }

  const parsed = markersPayloadSchema.safeParse({ markers });
  if (!parsed.success) return fail(t.errors.generic);

  const incoming = parsed.data.markers;
  const existing = await db
    .select({ id: mapMarkers.id })
    .from(mapMarkers)
    .where(eq(mapMarkers.eventId, eventId));

  const keep = new Set(incoming.map((m) => m.id).filter(Boolean) as string[]);
  const toDelete = existing.filter((row) => !keep.has(row.id)).map((row) => row.id);

  if (toDelete.length) {
    await db.delete(mapMarkers).where(inArray(mapMarkers.id, toDelete));
  }

  for (const marker of incoming) {
    const values = {
      eventId,
      type: marker.type,
      name: marker.name,
      description: marker.description ?? null,
      x: marker.x,
      y: marker.y,
      gateId: marker.gateId || null,
      workingPointId: marker.workingPointId || null,
      eventMemberId: marker.eventMemberId || null,
      updatedAt: new Date(),
    };
    if (marker.id && keep.has(marker.id) && existing.some((e) => e.id === marker.id)) {
      await db.update(mapMarkers).set(values).where(eq(mapMarkers.id, marker.id));
    } else {
      await db.insert(mapMarkers).values({ id: marker.id ?? newId(), ...values });
    }
  }

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'MAP_MARKER',
    entityLabel: t.map.title,
    newValues: { count: incoming.length },
    summary: `${t.map.markersSaved} (${incoming.length})`,
  });

  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${eventId}/map`);
    revalidatePath(`${base}/events/${eventId}/assignments`);
  }
  return ok(t.map.markersSaved);
}
