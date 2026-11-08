'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, inArray, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

import { db } from '@/db';
import { eventAccess, users } from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { createSession, destroySession, readSession } from '@/server/auth/session';
import { currentUser, homeFor } from '@/server/auth/rbac';
import { newId } from '@/lib/ids';
import { recordAudit } from '@/server/services/audit';
import type { Role } from '@/lib/constants';

import { fail, ok, type ActionState } from './types';

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const username = String(formData.get('username') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '');

  if (!username || !password) return fail(t.errors.required);

  const user = await db.query.users.findFirst({
    where: eq(users.username, username),
  });

  // Always run a hash comparison so a wrong username and a wrong password cost
  // the same time — no account enumeration through response timing.
  const hash =
    user?.passwordHash ?? '$2b$10$ZZZZZZZZZZZZZZZZZZZZZeZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ';
  const valid = await bcrypt.compare(password, hash).catch(() => false);

  if (!user || !valid) return fail(t.auth.invalidCredentials);
  if (!user.active) return fail(t.auth.accountDisabled);

  await createSession({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role as Role,
    systemDeveloper: user.systemDeveloper,
  });

  await recordAudit({
    actorId: user.id,
    actorName: user.name,
    action: 'LOGIN',
    entity: 'USER',
    entityId: user.id,
    entityLabel: user.name,
    summary: `${user.name} — ${t.enums.auditAction.LOGIN}`,
  });

  redirect(next && next.startsWith('/') ? next : homeFor(user.role as Role));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}

/**
 * Changing your own password, and nobody else's.
 *
 * The accounts are created with first-use passwords that are written in the
 * source and therefore known to anyone who can read it, so being able to
 * change one from inside the app is not a convenience — it is the step that
 * makes the account yours. The current password is required even though the
 * person is already signed in: a session left open on an unattended laptop
 * should not be enough to lock its owner out.
 */
export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const me = await readSession();
  if (!me) return fail(t.errors.forbidden);

  const current = String(formData.get('currentPassword') ?? '');
  const next = String(formData.get('newPassword') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');

  if (!current || !next || !confirm) return fail(t.errors.required);
  if (next !== confirm) return fail(t.auth.passwordsDiffer);
  if (next.length < 8) return fail(t.auth.passwordTooShort);
  if (next === current) return fail(t.auth.passwordUnchanged);

  const user = await db.query.users.findFirst({ where: eq(users.id, me.id) });
  if (!user) return fail(t.errors.forbidden);

  const valid = await bcrypt.compare(current, user.passwordHash).catch(() => false);
  if (!valid) return fail(t.auth.currentPasswordWrong);

  await db
    .update(users)
    .set({ passwordHash: bcrypt.hashSync(next, 10), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  // The log records that it happened and by whom. Neither password goes in it.
  await recordAudit({
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'USER',
    entityId: user.id,
    entityLabel: user.name,
    summary: `${user.name} — ${t.auth.passwordChanged}`,
  });

  revalidatePath('/admin/settings');
  return ok(t.auth.passwordChanged);
}

const ACCOUNT_ROLES: Role[] = ['ADMIN', 'TEAM_LEADER', 'GATE_LEADER'];

/** Admin-created accounts receive a one-time random password, shown only here. */
export async function createAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const actor = await currentUser();
  if (!actor?.systemDeveloper) return fail(t.errors.forbidden);

  const name = String(formData.get('name') ?? '').trim().slice(0, 100);
  const username = String(formData.get('username') ?? '').trim().toLowerCase();
  const role = String(formData.get('role') ?? '') as Role;
  const systemDeveloper = formData.get('systemDeveloper') === 'on';
  if (!name || !/^[a-z0-9._-]{3,32}$/.test(username) || !ACCOUNT_ROLES.includes(role)) {
    return fail(t.auth.accountCreateFailed);
  }
  const existing = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (existing) return fail(t.auth.usernameTaken);

  const password = randomBytes(12).toString('base64url');
  const id = newId();
  await db.insert(users).values({
    id,
    username,
    email: null,
    name,
    passwordHash: bcrypt.hashSync(password, 10),
    role: systemDeveloper ? 'ADMIN' : role,
    systemDeveloper,
    active: true,
    teamMemberId: null,
  });
  await recordAudit({
    actorId: actor.id,
    actorName: actor.name,
    action: 'CREATE',
    entity: 'USER',
    entityId: id,
    entityLabel: name,
    newValues: { username, role: systemDeveloper ? 'ADMIN' : role, systemDeveloper },
    summary: `${t.enums.auditAction.CREATE}: ${name}`,
  });
  revalidatePath('/admin/settings');
  return ok(`${t.auth.accountCreated} ${password}`);
}

/** Only a system developer can change account roles. */
export async function changeAccountRoleAction(formData: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor?.systemDeveloper) return;
  const userId = String(formData.get('userId') ?? '');
  const role = String(formData.get('role') ?? '') as Role;
  if (!userId || !ACCOUNT_ROLES.includes(role) || userId === actor.id) return;

  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target || target.role === role) return;
  if (target.systemDeveloper && role !== 'ADMIN') return;
  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
  // ADMIN accounts can still be appointed as an event's team leader; the
  // event grant is separate from the account's system-wide role.
  if (role !== 'TEAM_LEADER' && role !== 'ADMIN') {
    await db.delete(eventAccess).where(and(
      eq(eventAccess.userId, userId),
      inArray(eventAccess.role, ['TEAM_LEADER', 'TEAM_LEADER_ASSISTANT']),
    ));
  }
  if (role !== 'GATE_LEADER') {
    await db.delete(eventAccess).where(and(eq(eventAccess.userId, userId), eq(eventAccess.role, 'GATE_LEADER')));
  }
  await recordAudit({
    actorId: actor.id,
    actorName: actor.name,
    action: 'UPDATE',
    entity: 'USER',
    entityId: target.id,
    entityLabel: target.name,
    oldValues: { role: target.role },
    newValues: { role },
    summary: `${target.name}: ${target.role} → ${role}`,
  });
  revalidatePath('/admin/settings');
}

export async function setSystemDeveloperAction(formData: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor?.systemDeveloper) return;
  const userId = String(formData.get('userId') ?? '');
  if (!userId || userId === actor.id) return;
  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target) return;
  const next = formData.get('systemDeveloper') === 'on';
  if (target.systemDeveloper === next) return;
  if (!next) {
    const remaining = await db.get<{ count: number }>(
      sql`select count(*) as count from users where system_developer = 1 and active = 1 and id <> ${userId}`,
    );
    if ((remaining?.count ?? 0) === 0) return;
  }
  await db.update(users).set({
    systemDeveloper: next,
    ...(next ? { role: 'ADMIN' } : {}),
    updatedAt: new Date(),
  }).where(eq(users.id, userId));
  await recordAudit({
    actorId: actor.id,
    actorName: actor.name,
    action: 'UPDATE',
    entity: 'USER',
    entityId: target.id,
    entityLabel: target.name,
    oldValues: { systemDeveloper: target.systemDeveloper, role: target.role },
    newValues: { systemDeveloper: next, role: next ? 'ADMIN' : target.role },
    summary: `${target.name}: ${next ? 'SYSTEM_DEVELOPER_GRANTED' : 'SYSTEM_DEVELOPER_REVOKED'}`,
  });
  revalidatePath('/admin/settings');
}

export async function deleteAccountAction(formData: FormData): Promise<void> {
  const { t } = await getT();
  const actor = await currentUser();
  if (!actor?.systemDeveloper) return;
  const userId = String(formData.get('userId') ?? '');
  if (!userId || userId === actor.id) return;
  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target) return;
  if (target.systemDeveloper) {
    const remaining = await db.get<{ count: number }>(
      sql`select count(*) as count from users where system_developer = 1 and active = 1 and id <> ${userId}`,
    );
    if ((remaining?.count ?? 0) === 0) return;
  }
  await recordAudit({
    actorId: actor.id,
    actorName: actor.name,
    action: 'DELETE',
    entity: 'USER',
    entityId: target.id,
    entityLabel: target.name,
    oldValues: { username: target.username, role: target.role, systemDeveloper: target.systemDeveloper },
    summary: `${target.name} — ${t.auth.accountDeleted}`,
  });
  await db.delete(users).where(eq(users.id, userId));
  revalidatePath('/admin/settings');
}
