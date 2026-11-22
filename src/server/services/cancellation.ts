import 'server-only';

import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { eventMembers, events } from '@/db/schema';
import { EVENT_STATUS_FLOW, type EventStatus } from '@/lib/constants';

/** Called only after the action verifies ADMIN access. Never alters crew or pay rows. */
export async function cancelEvent(eventId: string, actorId: string, reason: string) {
  if (reason.trim().length < 5 || reason.length > 1000) return 'REASON' as const;
  return db.transaction(async (tx) => {
    const event = await tx.query.events.findFirst({ where: eq(events.id, eventId) });
    if (!event || !EVENT_STATUS_FLOW[event.status as EventStatus]?.includes('CANCELLED')) {
      return 'STATUS' as const;
    }
    const paid = await tx.select({ id: eventMembers.id }).from(eventMembers).where(and(
      eq(eventMembers.eventId, eventId), isNotNull(eventMembers.payoutId),
    )).limit(1);
    if (paid.length) return 'PAID' as const;
    const now = new Date();
    await tx.update(events).set({
      status: 'CANCELLED',
      heldAt: now,
      // Release approved chair work even when it was not detached beforehand.
      seatPayDetachedAt: event.seatPayDetachedAt ?? now,
      seatPayDetachedBy: event.seatPayDetachedBy ?? actorId,
      seatPayDetachedReason: event.seatPayDetachedReason ?? reason.trim(),
      updatedAt: now,
    }).where(eq(events.id, eventId));
    return 'OK' as const;
  });
}
