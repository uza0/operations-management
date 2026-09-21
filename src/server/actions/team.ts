'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, ne } from 'drizzle-orm';

import { db } from '@/db';
import { eventMembers, teamMembers } from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { bool, firstIssueKey, str, teamMemberSchema } from '@/lib/validation';
import { assertRole } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';
import { nextEmployeeCode } from '@/server/services/team';

import { fail, ok, type ActionState } from './types';

export async function saveTeamMemberAction(
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

  const id = str(form, 'memberId');

  /*
   * A new person is given the next code in the roster's own sequence rather
   * than being asked for one. The form does not send the field at all when
   * adding, so there is nothing to mistype and no way to collide with a code
   * that already belongs to somebody. An existing member keeps whatever code
   * he has unless the edit form sends a different one — a code is the key the
   * rest of the system remembers a person by, so it is never rewritten by
   * accident.
   */
  const submittedCode = str(form, 'employeeCode');
  let employeeCode = submittedCode;
  if (!employeeCode) {
    employeeCode = id
      ? ((await db.query.teamMembers.findFirst({ where: eq(teamMembers.id, id) }))
          ?.employeeCode ?? '')
      : await nextEmployeeCode();
  }

  const parsed = teamMemberSchema.safeParse({
    fullName: str(form, 'fullName') ?? '',
    phone: str(form, 'phone'),
    employeeCode,
    active: bool(form, 'active'),
    notes: str(form, 'notes'),
  });
  if (!parsed.success) {
    const errors = t.errors as unknown as Record<string, string>;
    return fail(errors[firstIssueKey(parsed.error)] ?? t.errors.generic);
  }

  // Employee code is the human key operations teams actually use.
  const duplicate = await db.query.teamMembers.findFirst({
    where: id
      ? and(eq(teamMembers.employeeCode, parsed.data.employeeCode), ne(teamMembers.id, id))
      : eq(teamMembers.employeeCode, parsed.data.employeeCode),
  });
  if (duplicate) return fail(t.team.codeTaken);

  if (id) {
    const existing = await db.query.teamMembers.findFirst({
      where: eq(teamMembers.id, id),
    });
    if (!existing) return fail(t.errors.notFound);
    await db
      .update(teamMembers)
      .set({
        fullName: parsed.data.fullName,
        phone: parsed.data.phone ?? null,
        employeeCode: parsed.data.employeeCode,
        active: parsed.data.active ?? true,
        notes: parsed.data.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(teamMembers.id, id));
    await recordAudit({
      actorId: user.id,
      actorName: user.name,
      action: 'UPDATE',
      entity: 'TEAM_MEMBER',
      entityId: id,
      entityLabel: parsed.data.fullName,
      oldValues: { fullName: existing.fullName, active: existing.active },
      newValues: { fullName: parsed.data.fullName, active: parsed.data.active ?? true },
      summary: `${t.enums.auditAction.UPDATE}: ${parsed.data.fullName}`,
    });
  } else {
    const memberId = newId();
    await db.insert(teamMembers).values({
      id: memberId,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone ?? null,
      employeeCode: parsed.data.employeeCode,
      active: parsed.data.active ?? true,
      notes: parsed.data.notes ?? null,
    });
    await recordAudit({
      actorId: user.id,
      actorName: user.name,
      action: 'CREATE',
      entity: 'TEAM_MEMBER',
      entityId: memberId,
      entityLabel: parsed.data.fullName,
      newValues: { fullName: parsed.data.fullName },
      summary: `${t.enums.auditAction.CREATE}: ${parsed.data.fullName}`,
    });
  }

  revalidatePath('/admin/team');
  return ok();
}

export async function toggleTeamMemberAction(
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

  const id = str(form, 'memberId');
  if (!id) return fail(t.errors.notFound);
  const member = await db.query.teamMembers.findFirst({ where: eq(teamMembers.id, id) });
  if (!member) return fail(t.errors.notFound);

  await db
    .update(teamMembers)
    .set({ active: !member.active, updatedAt: new Date() })
    .where(eq(teamMembers.id, id));

  await recordAudit({
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'TEAM_MEMBER',
    entityId: id,
    entityLabel: member.fullName,
    oldValues: { active: member.active },
    newValues: { active: !member.active },
    summary: `${member.fullName}: ${!member.active ? t.team.active : t.team.inactive}`,
  });

  revalidatePath('/admin/team');
  return ok();
}

export async function deleteTeamMemberAction(
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

  const id = str(form, 'memberId');
  if (!id) return fail(t.errors.notFound);
  const member = await db.query.teamMembers.findFirst({ where: eq(teamMembers.id, id) });
  if (!member) return fail(t.errors.notFound);

  // People who have worked an event are never deleted — that would erase the
  // operational history of those events. Deactivate instead (spec §48).
  const participations = await db.$count(
    eventMembers,
    eq(eventMembers.teamMemberId, id),
  );
  if (participations > 0) {
    return fail(t.team.deactivate);
  }

  await db.delete(teamMembers).where(eq(teamMembers.id, id));
  await recordAudit({
    actorId: user.id,
    actorName: user.name,
    action: 'DELETE',
    entity: 'TEAM_MEMBER',
    entityId: id,
    entityLabel: member.fullName,
    summary: `${t.enums.auditAction.DELETE}: ${member.fullName}`,
  });

  revalidatePath('/admin/team');
  return ok();
}
