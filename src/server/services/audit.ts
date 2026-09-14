import 'server-only';

import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { auditLogs } from '@/db/schema';
import type { AuditAction, AuditEntity } from '@/lib/constants';
import { newId } from '@/lib/ids';

type RecordArgs = {
  eventId?: string | null;
  actorId?: string | null;
  actorName: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string | null;
  entityLabel?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  reason?: string | null;
  /** Short operational sentence: "Amir moved from Gate 4 to Gate 6". */
  summary: string;
};

/**
 * Append-only operational history (spec §28). Audit rows are never updated or
 * deleted by application code; the UI exposes them read-only.
 */
export async function recordAudit(args: RecordArgs): Promise<void> {
  await db.insert(auditLogs).values({
    id: newId(),
    eventId: args.eventId ?? null,
    actorId: args.actorId ?? null,
    actorName: args.actorName,
    action: args.action,
    entity: args.entity,
    entityId: args.entityId ?? null,
    entityLabel: args.entityLabel ?? null,
    oldValues: args.oldValues ? JSON.stringify(args.oldValues) : null,
    newValues: args.newValues ? JSON.stringify(args.newValues) : null,
    reason: args.reason ?? null,
    summary: args.summary,
  });
}

export async function listEventAudit(eventId: string, limit = 200) {
  return db.query.auditLogs.findMany({
    where: eq(auditLogs.eventId, eventId),
    orderBy: [desc(auditLogs.createdAt)],
    limit,
  });
}

export async function listRecentAudit(limit = 12) {
  return db.query.auditLogs.findMany({
    orderBy: [desc(auditLogs.createdAt)],
    limit,
  });
}
