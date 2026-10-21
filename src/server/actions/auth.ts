'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

import { db } from '@/db';
import { users } from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { createSession, destroySession, readSession } from '@/server/auth/session';
import { homeFor } from '@/server/auth/rbac';
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
