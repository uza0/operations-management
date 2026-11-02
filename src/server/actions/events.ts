'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { assignments, events, gates, venues } from '@/db/schema';
import { format } from '@/lib/i18n';
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
import { cloneEventPlan } from '@/server/services/clone';
import { setEventTeamLeader, setGateLeader } from '@/server/services/access';
import { hrefForStep } from '@/features/event/setup-steps';
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
    teamDepartureTime: str(form, 'teamDepartureTime'),
    description: str(form, 'description'),
    externalId: str(form, 'externalId'),
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
    teamDepartureTime: parsed.data.teamDepartureTime ?? null,
    description: parsed.data.description ?? null,
    externalId: parsed.data.externalId || null,
    status: 'DRAFT',
    createdById: user.id,
  });

  /*
   * Built from a previous event: copy its plan across before anything else
   * touches the new event, so the first screen the admin sees is already the
   * gates and the team rather than an empty shell.
   */
  const templateId = str(form, 'templateEventId');
  let cloned: Awaited<ReturnType<typeof cloneEventPlan>> | null = null;
  if (templateId) {
    const source = await db.query.events.findFirst({ where: eq(events.id, templateId) });
    if (!source) return fail(t.errors.notFound);
    cloned = await cloneEventPlan(templateId, id, {
      arrivalTime: parsed.data.teamArrivalTime,
      departureTime: parsed.data.teamDepartureTime ?? null,
      withTeam: bool(form, 'copyTeam'),
      withTimeline: bool(form, 'copyTimeline'),
      createdById: user.id,
    });
  }

  // The creating admin may hand the event to a team leader straight away.
  await setEventTeamLeader(id, str(form, 'leaderId') || null);

  await recordAudit({
    eventId: id,
    actorId: user.id,
    actorName: user.name,
    action: 'CREATE',
    entity: 'EVENT',
    entityId: id,
    entityLabel: parsed.data.name,
    newValues: {
      status: 'DRAFT',
      venue: venue.name,
      date: parsed.data.date,
      ...(cloned ? { copiedFrom: templateId, ...cloned } : {}),
    },
    summary: `${t.enums.auditAction.CREATE}: ${parsed.data.name}`,
  });

  revalidatePath('/admin/events');
  /*
   * Straight into the walk-through rather than onto an empty overview: a new
   * event has nothing on it, and the first screen a supervisor sees should be
   * the first thing he has to do, not a summary of nothing.
   */
  redirect(hrefForStep('/admin', id, 1));
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
    teamDepartureTime: str(form, 'teamDepartureTime'),
    description: str(form, 'description'),
    externalId: str(form, 'externalId'),
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
      teamDepartureTime: parsed.data.teamDepartureTime ?? null,
      description: parsed.data.description ?? null,
      externalId: parsed.data.externalId || null,
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId));

  /*
   * Who is running this event, which arrives on the same form because it
   * changes for the same reasons the hours do — somebody fell ill, the job
   * moved to a colleague. Left out of the form entirely it reads as "nobody",
   * so only an actual field clears it.
   */
  let leaderChange: Awaited<ReturnType<typeof setEventTeamLeader>> = { changed: false };
  if (form.has('leaderId')) {
    leaderChange = await setEventTeamLeader(eventId, str(form, 'leaderId') || null);
  }

  /*
   * The event's hours are the team's hours, so moving them moves everyone who
   * was never given hours of their own. "Their own" means an assignment whose
   * times no longer match what the event said — those are left exactly as they
   * are, because somebody decided them on purpose.
   */
  const movedArrival = existing.teamArrivalTime !== parsed.data.teamArrivalTime;
  const movedDeparture =
    (existing.teamDepartureTime ?? null) !== (parsed.data.teamDepartureTime ?? null);

  if (movedArrival || movedDeparture) {
    const rows = await db
      .select()
      .from(assignments)
      .where(eq(assignments.eventId, eventId));

    let moved = 0;
    for (const row of rows) {
      const followedArrival =
        row.arrivalTime === existing.teamArrivalTime &&
        row.shiftStart === existing.teamArrivalTime;
      const followedDeparture =
        existing.teamDepartureTime !== null && row.shiftEnd === existing.teamDepartureTime;

      const next: Partial<typeof row> = {};
      if (movedArrival && followedArrival) {
        next.arrivalTime = parsed.data.teamArrivalTime;
        next.shiftStart = parsed.data.teamArrivalTime;
      }
      if (movedDeparture && followedDeparture && parsed.data.teamDepartureTime) {
        next.shiftEnd = parsed.data.teamDepartureTime;
      }
      if (Object.keys(next).length === 0) continue;

      await db
        .update(assignments)
        .set({ ...next, updatedById: user.id, updatedAt: new Date() })
        .where(eq(assignments.id, row.id));
      moved += 1;
    }

    if (moved > 0) {
      await recordAudit({
        eventId,
        actorId: user.id,
        actorName: user.name,
        action: 'UPDATE',
        entity: 'ASSIGNMENT',
        entityId: null,
        entityLabel: null,
        oldValues: {
          teamArrivalTime: existing.teamArrivalTime,
          teamDepartureTime: existing.teamDepartureTime,
        },
        newValues: {
          teamArrivalTime: parsed.data.teamArrivalTime,
          teamDepartureTime: parsed.data.teamDepartureTime ?? null,
          assignmentsMoved: moved,
        },
        summary: format(t.event.hoursMoved, { n: moved }),
      });
    }
  }

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
      teamDepartureTime: existing.teamDepartureTime,
      ...(leaderChange.changed ? { teamLeader: leaderChange.from ?? null } : {}),
    },
    newValues: {
      name: parsed.data.name,
      date: parsed.data.date,
      startTime: parsed.data.startTime,
      teamArrivalTime: parsed.data.teamArrivalTime,
      teamDepartureTime: parsed.data.teamDepartureTime ?? null,
      ...(leaderChange.changed ? { teamLeader: leaderChange.to ?? null } : {}),
    },
    summary: `${t.enums.auditAction.UPDATE}: ${parsed.data.name}`,
  });

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/leader/events/${eventId}`);
  return ok();
}

/**
 * Puts an account in charge of one gate.
 *
 * Its own action rather than a field on the gate form, because it answers a
 * different question. The gate form describes the post — what it is, how many
 * people it needs, who from the crew stands at its head. This says which
 * account supervises it: who signs in, approves the arrivals there and takes
 * the reports. Often not the same person, and never the same record.
 */
export async function setGateSupervisorAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const gateId = String(form.get('gateId') ?? '');

  let user;
  try {
    user = await assertEventManager(eventId);
  } catch {
    return fail(t.errors.forbidden);
  }
  if (!gateId) return fail(t.errors.notFound);

  const gate = await db.query.gates.findFirst({
    where: and(eq(gates.id, gateId), eq(gates.eventId, eventId)),
  });
  if (!gate) return fail(t.errors.notFound);

  const change = await setGateLeader(eventId, gateId, str(form, 'userId') || null);

  if (change.changed) {
    await recordAudit({
      eventId,
      actorId: user.id,
      actorName: user.name,
      action: 'UPDATE',
      entity: 'GATE',
      entityId: gateId,
      entityLabel: gate.name,
      oldValues: { supervisor: change.from },
      newValues: { supervisor: change.to },
      summary: `${t.event.gateLeader}: ${gate.name}`,
    });
  }

  revalidatePath(`/admin/events/${eventId}/gates`);
  revalidatePath(`/leader/events/${eventId}/gates`);
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

  /*
   * Assignments first, then the event.
   *
   * Deleting the event cascades to its gates, but an assignment points at its
   * gate with ON DELETE RESTRICT — on purpose, so that nobody removes a gate
   * with people standing at it. That rule fires here too: the cascade reaches
   * the gates while the assignments still reference them, the delete is
   * refused, and the page shows an error. An event with nobody placed on it
   * deletes cleanly, which is why the rehearsals went and the real one stayed.
   *
   * So the assignments are cleared first and the cascade is left with nothing
   * to object to. Everything else hanging off the event — members, attendance,
   * announcements, reports, markers, the questionnaire — already cascades.
   */
  await db.delete(assignments).where(eq(assignments.eventId, eventId));
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

/**
 * The company's own number for this event, on its own.
 *
 * Separate from editing the event because it arrives separately: the booking
 * side sends it when they send it, which is sometimes before the night and
 * sometimes a fortnight after it, when somebody is reconciling two systems.
 * Asking a supervisor to reopen the whole event form — name, venue, hours,
 * all of it validated — to type one reference into a finished event is how a
 * reference ends up in a WhatsApp message instead.
 *
 * It works at every stage, archived included, and it is the one field here
 * that does: nothing in this system depends on it, so changing it changes no
 * arithmetic, moves no shift and reprices nothing.
 */
export async function setEventReferenceAction(
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

  const raw = str(form, 'externalId');
  const value = raw ? raw.trim().slice(0, 60) : null;

  await db
    .update(events)
    .set({ externalId: value, updatedAt: new Date() })
    .where(eq(events.id, eventId));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'EVENT',
    entityId: eventId,
    entityLabel: existing.name,
    oldValues: { externalId: existing.externalId },
    newValues: { externalId: value },
    summary: `${t.event.externalId}: ${value ?? '—'}`,
  });

  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${eventId}`);
    revalidatePath(`${base}/events/${eventId}/reports`);
  }
  return ok();
}
