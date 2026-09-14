'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { assignments, eventAccess, events, gates, venues } from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { EVENT_STATUS_FLOW, type EventStatus } from '@/lib/constants';
import { bool, eventSchema, firstIssueKey, str } from '@/lib/validation';
import {
  assertEventManager,
  assertRole,
  currentUser,
  ForbiddenError,
  workspaceBase,
} from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';
import { getStaffedLocations } from '@/server/services/staffing';

import { fail, ok, type ActionState } from './types';

function message(t: Awaited<ReturnType<typeof getT>>['t'], key: string) {
  const errors = t.errors as unknown as Record<string, string>;
  return errors[key] ?? t.errors.generic;
}

/* -------------------------------------------------------------------------- */

export async function createEventAction(
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

  const parsed = eventSchema.safeParse({
    name: str(form, 'name') ?? '',
    type: str(form, 'type') ?? '',
    venueId: str(form, 'venueId') ?? '',
    date: str(form, 'date') ?? '',
    startTime: str(form, 'startTime') ?? '',
    teamArrivalTime: str(form, 'teamArrivalTime') ?? '',
    description: str(form, 'description'),
  });
  if (!parsed.success) return fail(message(t, firstIssueKey(parsed.error)));

  const venue = await db.query.venues.findFirst({
    where: eq(venues.id, parsed.data.venueId),
  });
  if (!venue) return fail(t.errors.notFound);

  const id = newId();
  await db.insert(events).values({
    id,
    name: parsed.data.name,
    type: parsed.data.type,
    venueId: parsed.data.venueId,
    date: parsed.data.date,
    startTime: parsed.data.startTime,
    teamArrivalTime: parsed.data.teamArrivalTime,
    description: parsed.data.description ?? null,
    status: 'DRAFT',
    createdById: user.id,
  });

  // The creating admin may hand the event to a team leader straight away.
  const leaderId = str(form, 'leaderId');
  if (leaderId) {
    await db.insert(eventAccess).values({
      id: newId(),
      eventId: id,
      userId: leaderId,
      role: 'TEAM_LEADER',
      gateId: null,
    });
  }

  await recordAudit({
    eventId: id,
    actorId: user.id,
    actorName: user.name,
    action: 'CREATE',
    entity: 'EVENT',
    entityId: id,
    entityLabel: parsed.data.name,
    newValues: { status: 'DRAFT', venue: venue.name, date: parsed.data.date },
    summary: `${t.enums.auditAction.CREATE}: ${parsed.data.name}`,
  });

  revalidatePath('/admin/events');
  redirect(`/admin/events/${id}`);
}

export async function updateEventAction(
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

  const existing = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!existing) return fail(t.errors.notFound);

  const parsed = eventSchema.safeParse({
    name: str(form, 'name') ?? '',
    type: str(form, 'type') ?? '',
    venueId: str(form, 'venueId') ?? '',
    date: str(form, 'date') ?? '',
    startTime: str(form, 'startTime') ?? '',
    teamArrivalTime: str(form, 'teamArrivalTime') ?? '',
    description: str(form, 'description'),
  });
  if (!parsed.success) return fail(message(t, firstIssueKey(parsed.error)));

  await db
    .update(events)
    .set({
      name: parsed.data.name,
      type: parsed.data.type,
      venueId: parsed.data.venueId,
      date: parsed.data.date,
      startTime: parsed.data.startTime,
      teamArrivalTime: parsed.data.teamArrivalTime,
      description: parsed.data.description ?? null,
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
    entityLabel: parsed.data.name,
    oldValues: {
      name: existing.name,
      date: existing.date,
      startTime: existing.startTime,
      teamArrivalTime: existing.teamArrivalTime,
    },
    newValues: {
      name: parsed.data.name,
      date: parsed.data.date,
      startTime: parsed.data.startTime,
      teamArrivalTime: parsed.data.teamArrivalTime,
    },
    summary: `${t.enums.auditAction.UPDATE}: ${parsed.data.name}`,
  });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/leader/events/${eventId}`);
  return ok();
}

/**
 * Lifecycle transitions are validated against EVENT_STATUS_FLOW, and moving to
 * READY refuses while any gate is still understaffed (spec §63).
 */
export async function changeEventStatusAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const next = String(form.get('status') ?? '') as EventStatus;

  let user;
  try {
    user = await assertEventManager(eventId);
  } catch {
    return fail(t.errors.forbidden);
  }

  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!event) return fail(t.errors.notFound);

  const from = event.status as EventStatus;
  if (!EVENT_STATUS_FLOW[from]?.includes(next)) return fail(t.errors.forbidden);

  if (next === 'READY' || next === 'LIVE') {
    const locations = await getStaffedLocations(eventId);
    const short = locations.filter((l) => l.level === 'UNDERSTAFFED');
    if (short.length && !bool(form, 'force')) {
      return {
        status: 'conflict',
        message: `${t.event.notReady} — ${t.event.notReadyDetail} ${short
          .map((l) => `${l.name} (${l.assignedStaff}/${l.requiredStaff})`)
          .join('، ')}`,
      };
    }
  }

  await db
    .update(events)
    .set({ status: next, updatedAt: new Date() })
    .where(eq(events.id, eventId));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'STATUS_CHANGE',
    entity: 'EVENT',
    entityId: eventId,
    entityLabel: event.name,
    oldValues: { status: from },
    newValues: { status: next },
    reason: str(form, 'reason'),
    summary: `${event.name}: ${t.enums.eventStatus[from]} → ${t.enums.eventStatus[next]}`,
  });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/leader/events/${eventId}`);
  revalidatePath('/admin');
  return ok();
}

export async function deleteEventAction(form: FormData): Promise<void> {
  const eventId = String(form.get('eventId') ?? '');
  const user = await currentUser();
  if (!user || user.role !== 'ADMIN') throw new ForbiddenError();

  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!event) redirect('/admin/events');

  const { t } = await getT();
  await recordAudit({
    eventId: null,
    actorId: user.id,
    actorName: user.name,
    action: 'DELETE',
    entity: 'EVENT',
    entityId: eventId,
    entityLabel: event.name,
    oldValues: { name: event.name, status: event.status },
    summary: `${t.enums.auditAction.DELETE}: ${event.name}`,
  });

  await db.delete(events).where(eq(events.id, eventId));
  revalidatePath('/admin/events');
  redirect('/admin/events');
}

/** Saves the operational notes shown at the end of the event report. */
export async function saveReportNotesAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  try {
    await assertEventManager(eventId);
  } catch {
    return fail(t.errors.forbidden);
  }
  await db
    .update(events)
    .set({ reportNotes: str(form, 'reportNotes'), updatedAt: new Date() })
    .where(eq(events.id, eventId));

  revalidatePath(`/admin/events/${eventId}/reports`);
  revalidatePath(`/leader/events/${eventId}/reports`);
  return ok();
}

/** Used by the "understaffed gates" panel to jump straight to assigning. */
export async function countGateAssignments(eventId: string, gateId: string) {
  const rows = await db
    .select({ id: assignments.id })
    .from(assignments)
    .where(and(eq(assignments.eventId, eventId), eq(assignments.gateId, gateId)));
  return rows.length;
}

export async function listGateNames(eventId: string) {
  return db.select({ id: gates.id, name: gates.name }).from(gates).where(eq(gates.eventId, eventId));
}

export async function redirectToWorkspace(eventId: string) {
  const user = await currentUser();
  redirect(`${workspaceBase(user?.role ?? 'TEAM_LEADER')}/events/${eventId}`);
}
