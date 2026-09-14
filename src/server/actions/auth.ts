'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

import { db } from '@/db';
import { users } from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { createSession, destroySession } from '@/server/auth/session';
import { homeFor } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';
import type { Role } from '@/lib/constants';

import { fail, type ActionState } from './types';

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
