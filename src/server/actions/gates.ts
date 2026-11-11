'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, ne } from 'drizzle-orm';

import { db } from '@/db';
import { assignments, gates, mapMarkers, workingPoints } from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { format } from '@/lib/i18n';
import {
  firstIssueKey,
  gateSchema,
  num,
  str,
  workingPointSchema,
} from '@/lib/validation';
import { assertEventManager } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';
import { promoteIfBuilt } from '@/server/services/lifecycle';

import { fail, ok, type ActionState } from './types';

function revalidateEvent(eventId: string) {
  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${eventId}`);
    revalidatePath(`${base}/events/${eventId}/gates`);
    revalidatePath(`${base}/events/${eventId}/assignments`);
    revalidatePath(`${base}/events/${eventId}/map`);
  }
}

/* -------------------------------- gates ---------------------------------- */

export async function saveGateAction(
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

  const gateId = str(form, 'gateId');
  const parsed = gateSchema.safeParse({
    name: str(form, 'name') ?? '',
    type: str(form, 'type') ?? 'GENERAL',
    description: str(form, 'description'),
    capacity: str(form, 'capacity') ? num(form, 'capacity') : null,
    requiredStaff: num(form, 'requiredStaff', 1),
    status: str(form, 'status') ?? 'INACTIVE',
    gateLeaderId: str(form, 'gateLeaderId'),
  });
  if (!parsed.success) {
    const errors = t.errors as unknown as Record<string, string>;
    return fail(errors[firstIssueKey(parsed.error)] ?? t.errors.generic);
  }

  const clash = await db.query.gates.findFirst({
    where: gateId
      ? and(eq(gates.eventId, eventId), eq(gates.name, parsed.data.name), ne(gates.id, gateId))
      : and(eq(gates.eventId, eventId), eq(gates.name, parsed.data.name)),
  });
  if (clash) return fail(t.gate.nameTaken);

  if (gateId) {
    const existing = await db.query.gates.findFirst({ where: eq(gates.id, gateId) });
    if (!existing || existing.eventId !== eventId) return fail(t.errors.notFound);
    await db
      .update(gates)
      .set({
        name: parsed.data.name,
        type: parsed.data.type,
        description: parsed.data.description ?? null,
        capacity: parsed.data.capacity ?? null,
        requiredStaff: parsed.data.requiredStaff,
        status: parsed.data.status,
        gateLeaderId: parsed.data.gateLeaderId || null,
        updatedAt: new Date(),
      })
      .where(eq(gates.id, gateId));

    await recordAudit({
      eventId,
      actorId: user.id,
      actorName: user.name,
      action: 'UPDATE',
      entity: 'GATE',
      entityId: gateId,
      entityLabel: parsed.data.name,
      oldValues: {
        name: existing.name,
        requiredStaff: existing.requiredStaff,
        status: existing.status,
      },
      newValues: {
        name: parsed.data.name,
        requiredStaff: parsed.data.requiredStaff,
        status: parsed.data.status,
      },
      summary: `${t.enums.auditAction.UPDATE} — ${parsed.data.name}`,
    });
  } else {
    const id = newId();
    const count = await db.$count(gates, eq(gates.eventId, eventId));
    await db.insert(gates).values({
      id,
      eventId,
      name: parsed.data.name,
      type: parsed.data.type,
      description: parsed.data.description ?? null,
      capacity: parsed.data.capacity ?? null,
      requiredStaff: parsed.data.requiredStaff,
      status: parsed.data.status,
      gateLeaderId: parsed.data.gateLeaderId || null,
      sortOrder: count,
    });
    await recordAudit({
      eventId,
      actorId: user.id,
      actorName: user.name,
      action: 'CREATE',
      entity: 'GATE',
      entityId: id,
      entityLabel: parsed.data.name,
      newValues: { requiredStaff: parsed.data.requiredStaff },
      summary: `${t.enums.auditAction.CREATE} — ${parsed.data.name}`,
    });
  }

  await promoteIfBuilt(eventId);
  revalidateEvent(eventId);
  return ok();
}

export async function deleteGateAction(
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

  const gateId = str(form, 'gateId');
  if (!gateId) return fail(t.errors.notFound);
  const gate = await db.query.gates.findFirst({ where: eq(gates.id, gateId) });
  if (!gate || gate.eventId !== eventId) return fail(t.errors.notFound);

  // A gate with people on it is never deleted silently (spec §46 / §63).
  const assigned = await db.$count(
    assignments,
    and(eq(assignments.gateId, gateId), ne(assignments.status, 'CANCELLED')),
  );
  if (assigned > 0) {
    return fail(format(t.gate.deleteBlocked, { n: assigned }));
  }

  // Cancelled assignments are retained while their location exists, but a
  // restrictive FK keeps even a vacant gate from being deleted. Once all
  // active assignments are ruled out, discard only these inactive rows (and
  // their cascading move history) before removing the gate.
  await db
    .delete(assignments)
    .where(and(eq(assignments.gateId, gateId), eq(assignments.status, 'CANCELLED')));
  await db.delete(mapMarkers).where(eq(mapMarkers.gateId, gateId));
  await db.delete(gates).where(eq(gates.id, gateId));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'DELETE',
    entity: 'GATE',
    entityId: gateId,
    entityLabel: gate.name,
    oldValues: { name: gate.name, requiredStaff: gate.requiredStaff },
    summary: `${t.enums.auditAction.DELETE} — ${gate.name}`,
  });

  await promoteIfBuilt(eventId);
  revalidateEvent(eventId);
  return ok();
}

/* ---------------------------- working points ----------------------------- */

export async function saveWorkingPointAction(
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

  const id = str(form, 'workingPointId');
  const parsed = workingPointSchema.safeParse({
    name: str(form, 'name') ?? '',
    type: str(form, 'type') ?? 'OTHER',
    description: str(form, 'description'),
    requiredStaff: num(form, 'requiredStaff', 1),
    status: str(form, 'status') ?? 'INACTIVE',
  });
  if (!parsed.success) {
    const errors = t.errors as unknown as Record<string, string>;
    return fail(errors[firstIssueKey(parsed.error)] ?? t.errors.generic);
  }

  const clash = await db.query.workingPoints.findFirst({
    where: id
      ? and(
          eq(workingPoints.eventId, eventId),
          eq(workingPoints.name, parsed.data.name),
          ne(workingPoints.id, id),
        )
      : and(eq(workingPoints.eventId, eventId), eq(workingPoints.name, parsed.data.name)),
  });
  if (clash) return fail(t.gate.nameTaken);

  if (id) {
    const existing = await db.query.workingPoints.findFirst({
      where: eq(workingPoints.id, id),
    });
    if (!existing || existing.eventId !== eventId) return fail(t.errors.notFound);
    await db
      .update(workingPoints)
      .set({
        name: parsed.data.name,
        type: parsed.data.type,
        description: parsed.data.description ?? null,
        requiredStaff: parsed.data.requiredStaff,
        status: parsed.data.status,
        updatedAt: new Date(),
      })
      .where(eq(workingPoints.id, id));
    await recordAudit({
      eventId,
      actorId: user.id,
      actorName: user.name,
      action: 'UPDATE',
      entity: 'WORKING_POINT',
      entityId: id,
      entityLabel: parsed.data.name,
      oldValues: { name: existing.name, requiredStaff: existing.requiredStaff },
      newValues: { name: parsed.data.name, requiredStaff: parsed.data.requiredStaff },
      summary: `${t.enums.auditAction.UPDATE} — ${parsed.data.name}`,
    });
  } else {
    const wpId = newId();
    const count = await db.$count(workingPoints, eq(workingPoints.eventId, eventId));
    await db.insert(workingPoints).values({
      id: wpId,
      eventId,
      name: parsed.data.name,
      type: parsed.data.type,
      description: parsed.data.description ?? null,
      requiredStaff: parsed.data.requiredStaff,
      status: parsed.data.status,
      sortOrder: count,
    });
    await recordAudit({
      eventId,
      actorId: user.id,
      actorName: user.name,
      action: 'CREATE',
      entity: 'WORKING_POINT',
      entityId: wpId,
      entityLabel: parsed.data.name,
      summary: `${t.enums.auditAction.CREATE} — ${parsed.data.name}`,
    });
  }

  await promoteIfBuilt(eventId);
  revalidateEvent(eventId);
  return ok();
}

export async function deleteWorkingPointAction(
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

  const id = str(form, 'workingPointId');
  if (!id) return fail(t.errors.notFound);
  const point = await db.query.workingPoints.findFirst({
    where: eq(workingPoints.id, id),
  });
  if (!point || point.eventId !== eventId) return fail(t.errors.notFound);

  const assigned = await db.$count(
    assignments,
    and(eq(assignments.workingPointId, id), ne(assignments.status, 'CANCELLED')),
  );
  if (assigned > 0) return fail(format(t.gate.deleteWpBlocked, { n: assigned }));

  await db
    .delete(assignments)
    .where(and(eq(assignments.workingPointId, id), eq(assignments.status, 'CANCELLED')));
  await db.delete(mapMarkers).where(eq(mapMarkers.workingPointId, id));
  await db.delete(workingPoints).where(eq(workingPoints.id, id));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'DELETE',
    entity: 'WORKING_POINT',
    entityId: id,
    entityLabel: point.name,
    summary: `${t.enums.auditAction.DELETE} — ${point.name}`,
  });

  await promoteIfBuilt(eventId);
  revalidateEvent(eventId);
  return ok();
}
