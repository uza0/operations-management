'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  assignments,
  eventFeedback,
  events,
  gates,
  issues,
  workingPoints,
} from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { firstIssueKey, issueSchema, str } from '@/lib/validation';
import { recordAudit } from '@/server/services/audit';
import { resolveMemberByToken } from '@/server/services/member';
import { routeNewIssue } from '@/server/services/issue-routing';
import { dueAtFor } from '@/lib/issue-sla';
import type { IssuePriority } from '@/lib/constants';

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

  /*
   * The same report, sent twice.
   *
   * A phone with no signal writes the report to itself and sends it when the
   * network returns; the promoter, seeing nothing happen, taps again. Both
   * carry the id the device minted, so the second arrival is recognised as the
   * first and answered with success — the report is in, which is what the
   * person asked about, and the board stays clean.
   *
   * A report sent with no client id at all (an older page, a browser with no
   * storage) is simply created, as before.
   */
  const clientId = str(form, 'clientId');
  if (clientId) {
    const already = await db.query.issues.findFirst({
      where: eq(issues.clientId, clientId),
    });
    if (already) {
      return already.eventId === member.eventId && already.reportedByMemberId === member.id
        ? ok(t.member.issueSent)
        : fail(t.errors.forbidden);
    }
  }

  const routed = await routeNewIssue({
    eventId: member.eventId,
    gateId: assignment?.gateId ?? null,
    priority: parsed.data.priority,
  });

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
    clientId: clientId ?? null,
    assigneeUserId: routed.assigneeUserId,
    assignedAt: routed.assignedAt,
    dueAt: routed.dueAt,
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

/**
 * A member's verdict on the event they just worked.
 *
 * Written with their own token and nothing else, and re-writable by them for
 * as long as they want to change their mind: this is an opinion, not a record
 * of fact, and an opinion someone cannot correct is one they stop giving. A
 * supervisor can read it and can never write it.
 *
 * It is refused before the event is marked finished — an evening that has not
 * happened yet cannot be reviewed, and a half-written verdict at the busiest
 * moment of the night is worse than none.
 */
export async function submitFeedbackAction(
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

  const event = await db.query.events.findFirst({ where: eq(events.id, member.eventId) });
  if (!event) return fail(t.errors.notFound);
  if (event.status !== 'COMPLETED' && event.status !== 'ARCHIVED') {
    return fail(t.feedback.notYet);
  }

  const rating = Number(form.get('rating') ?? 0);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return fail(t.feedback.pickRating);
  }

  const wentWell = str(form, 'wentWell');
  const problems = str(form, 'problems');
  const suggestions = str(form, 'suggestions');

  const existing = await db.query.eventFeedback.findFirst({
    where: and(
      eq(eventFeedback.eventId, member.eventId),
      eq(eventFeedback.eventMemberId, member.id),
    ),
  });

  if (existing) {
    await db
      .update(eventFeedback)
      .set({
        rating,
        wentWell: wentWell ?? null,
        problems: problems ?? null,
        suggestions: suggestions ?? null,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(eventFeedback.id, existing.id));
  } else {
    await db.insert(eventFeedback).values({
      id: newId(),
      eventId: member.eventId,
      eventMemberId: member.id,
      rating,
      wentWell: wentWell ?? null,
      problems: problems ?? null,
      suggestions: suggestions ?? null,
      submittedAt: new Date(),
    });
  }

  /*
   * The audit line records that a verdict arrived and from whom, never what it
   * said: the log is read by more people than the feedback is meant for, and a
   * complaint quoted in a log is a complaint nobody writes twice.
   */
  await recordAudit({
    eventId: member.eventId,
    actorId: null,
    actorName: member.name,
    action: 'UPDATE',
    entity: 'EVENT_MEMBER',
    entityId: member.id,
    entityLabel: member.name,
    summary: existing ? t.feedback.updated : t.feedback.received,
  });

  revalidatePath(`/member/${token}`);
  revalidatePath(`/admin/events/${member.eventId}/reports`);
  return ok(t.feedback.thanks);
}

/**
 * "It is still happening."
 *
 * The other half of the loop, and the half that decides whether anybody
 * reports anything a second time. Somebody at a desk marked this resolved;
 * the person standing in front of it says otherwise, and they are the one who
 * can see. So their word reopens it, puts it back in front of whoever closed
 * it, and counts — a report reopened twice is a different kind of problem from
 * a report reopened once, and the count is what makes that visible.
 *
 * Only the reporter may do this, only on their own report, and only on one
 * that was actually closed: reopening an open report would just be noise.
 */
export async function memberReopenIssueAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const token = String(form.get('token') ?? '');

  const member = await resolveMemberByToken(token);
  if (!member) return fail(t.member.invalidToken);
  if (member.status === 'CANCELLED') return fail(t.member.cancelled);

  const issueId = str(form, 'issueId');
  if (!issueId) return fail(t.errors.notFound);

  const row = await db.query.issues.findFirst({ where: eq(issues.id, issueId) });
  if (
    !row ||
    row.eventId !== member.eventId ||
    row.reportedByMemberId !== member.id
  ) {
    return fail(t.errors.notFound);
  }
  if (row.status !== 'RESOLVED' && row.status !== 'CLOSED') {
    return fail(t.errors.notFound);
  }

  const now = new Date();
  await db
    .update(issues)
    .set({
      status: 'OPEN',
      // The clock starts again, and it starts short: a problem that was
      // declared fixed and is not is more urgent than it was the first time.
      acknowledgedAt: null,
      resolvedAt: null,
      reopenedAt: now,
      reopenCount: row.reopenCount + 1,
      dueAt: dueAtFor(row.priority as IssuePriority, now),
      updatedAt: now,
    })
    .where(eq(issues.id, issueId));

  await recordAudit({
    eventId: member.eventId,
    actorId: null,
    actorName: member.name,
    action: 'UPDATE',
    entity: 'ISSUE',
    entityId: issueId,
    entityLabel: row.description.slice(0, 60),
    oldValues: { status: row.status },
    newValues: { status: 'OPEN', reopenCount: row.reopenCount + 1 },
    reason: t.member.stillHappening,
    summary: `${t.member.stillHappening}: ${member.name}`,
  });

  revalidatePath(`/member/${token}`);
  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${member.eventId}/issues`);
  }
  return ok(t.member.reopened);
}
