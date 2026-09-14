'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { assignments, gates, issues, workingPoints } from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { firstIssueKey, issueSchema, str } from '@/lib/validation';
import { recordAudit } from '@/server/services/audit';
import { resolveMemberByToken } from '@/server/services/member';

import { fail, ok, type ActionState } from './types';

/**
 * A member reports an issue using only their token. The gate is taken from
 * their own assignment, never from the form, so a member cannot file a report
 * against a gate they do not work (spec §30 / §53).
 */
export async function memberReportIssueAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const token = String(form.get('token') ?? '');

  const member = await resolveMemberByToken(token);
  if (!member) return fail(t.member.invalidToken);
  if (member.status === 'CANCELLED') return fail(t.member.cancelled);
  if (member.tokenExpiresAt && member.tokenExpiresAt.getTime() < Date.now()) {
    return fail(t.member.expiredToken);
  }

  const parsed = issueSchema.safeParse({
    type: str(form, 'type') ?? 'OTHER',
    description: str(form, 'description') ?? '',
    priority: str(form, 'priority') ?? 'MEDIUM',
    gateId: null,
    workingPointId: null,
  });
  if (!parsed.success) {
    const errors = t.errors as unknown as Record<string, string>;
    return fail(errors[firstIssueKey(parsed.error)] ?? t.errors.generic);
  }

  const assignment = await db
    .select({
      gateId: assignments.gateId,
      workingPointId: assignments.workingPointId,
    })
    .from(assignments)
    .where(
      and(
        eq(assignments.eventMemberId, member.id),
        eq(assignments.eventId, member.eventId),
      ),
    )
    .get();

  const id = newId();
  await db.insert(issues).values({
    id,
    eventId: member.eventId,
    type: parsed.data.type,
    description: parsed.data.description,
    priority: parsed.data.priority,
    status: 'OPEN',
    gateId: assignment?.gateId ?? null,
    workingPointId: assignment?.workingPointId ?? null,
    reportedByMemberId: member.id,
    reportedByUserId: null,
    reporterName: member.name,
  });

  let locationName: string | null = null;
  if (assignment?.gateId) {
    locationName =
      (await db.query.gates.findFirst({ where: eq(gates.id, assignment.gateId) }))?.name ??
      null;
  } else if (assignment?.workingPointId) {
    locationName =
      (
        await db.query.workingPoints.findFirst({
          where: eq(workingPoints.id, assignment.workingPointId),
        })
      )?.name ?? null;
  }

  await recordAudit({
    eventId: member.eventId,
    actorId: null,
    actorName: member.name,
    action: 'ISSUE',
    entity: 'ISSUE',
    entityId: id,
    entityLabel: t.enums.issueType[parsed.data.type],
    newValues: { priority: parsed.data.priority, location: locationName },
    summary: `${member.name} — ${t.enums.issueType[parsed.data.type]}${
      locationName ? ` (${locationName})` : ''
    }`,
  });

  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${member.eventId}/issues`);
    revalidatePath(`${base}/events/${member.eventId}`);
  }
  revalidatePath(`/member/${token}`);

  return ok(t.issue.submitted);
}
