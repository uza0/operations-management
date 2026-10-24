import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventAccess, issues } from '@/db/schema';
import { dueAtFor } from '@/lib/issue-sla';
import type { IssuePriority } from '@/lib/constants';

/**
 * Who a new report belongs to, and by when.
 *
 * The gate's own leader, because they are standing nearest to the problem and
 * can act without asking anybody — and because a single inbox for the whole
 * event becomes one person's bottleneck on exactly the night nobody has time
 * to queue. If the gate has no leader of its own, the report stays unassigned
 * rather than being handed to someone who cannot reach it: an owner who is not
 * there is worse than no owner, because the board stops showing it as needing
 * one.
 */
export async function routeNewIssue(input: {
  eventId: string;
  gateId: string | null;
  priority: IssuePriority;
  now?: Date;
}): Promise<{ assigneeUserId: string | null; assignedAt: Date | null; dueAt: Date | null }> {
  const now = input.now ?? new Date();
  const dueAt = dueAtFor(input.priority, now);

  if (!input.gateId) return { assigneeUserId: null, assignedAt: null, dueAt };

  const leader = await db
    .select({ userId: eventAccess.userId })
    .from(eventAccess)
    .where(
      and(
        eq(eventAccess.eventId, input.eventId),
        eq(eventAccess.role, 'GATE_LEADER'),
        eq(eventAccess.gateId, input.gateId),
      ),
    )
    .get();

  return leader
    ? { assigneeUserId: leader.userId, assignedAt: now, dueAt }
    : { assigneeUserId: null, assignedAt: null, dueAt };
}

/**
 * Hand a late report up to the team leader.
 *
 * There is no scheduler on this host and no background worker, so escalation
 * happens the moment somebody loads a screen that would show the report —
 * which is also the moment it starts to matter. The alternative, a cron job,
 * would buy nothing: a report nobody is looking at has not been escalated in
 * any sense a person would recognise.
 *
 * It runs once per report: `escalatedAt` is the latch.
 */
export async function escalateOverdue(
  eventId: string,
  overdueIds: string[],
  now: Date = new Date(),
): Promise<number> {
  if (overdueIds.length === 0) return 0;

  const teamLeader = await db
    .select({ userId: eventAccess.userId })
    .from(eventAccess)
    .where(and(eq(eventAccess.eventId, eventId), eq(eventAccess.role, 'TEAM_LEADER')))
    .get();

  let moved = 0;
  for (const id of overdueIds) {
    const row = await db.query.issues.findFirst({ where: eq(issues.id, id) });
    if (!row || row.escalatedAt) continue;
    await db
      .update(issues)
      .set({
        escalatedAt: now,
        // The team leader takes it over only when nobody else holds it; a gate
        // leader who has picked it up keeps it, and the escalation is a flag
        // on the board rather than a reassignment behind their back.
        assigneeUserId: row.assigneeUserId ?? teamLeader?.userId ?? null,
        assignedAt: row.assignedAt ?? (teamLeader ? now : null),
        updatedAt: now,
      })
      .where(eq(issues.id, id));
    moved += 1;
  }
  return moved;
}
