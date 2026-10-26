import 'server-only';

import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventAccess, users } from '@/db/schema';
import type { Role } from '@/lib/constants';

import { readSession, type SessionUser } from './session';

/**
 * Every server action and every page guards itself here. Route protection in
 * the client is convenience only — this module is the actual boundary
 * (spec §30 / §53).
 */

export class ForbiddenError extends Error {
  constructor(message = 'FORBIDDEN') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export async function currentUser(): Promise<SessionUser | null> {
  const session = await readSession();
  if (!session) return null;
  // The cookie is signed, but the account may have been disabled since.
  const row = await db.query.users.findFirst({
    where: eq(users.id, session.id),
    columns: { id: true, active: true, role: true, name: true, username: true },
  });
  if (!row || !row.active) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role as Role,
  };
}

/** Redirects anonymous visitors to the login page. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) {
    redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : '/login');
  }
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect('/forbidden');
  return user;
}

/** Same as requireRole but throws instead of redirecting — for server actions. */
export async function assertRole(...roles: Role[]): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new ForbiddenError();
  if (!roles.includes(user.role)) throw new ForbiddenError();
  return user;
}

export type EventScope = {
  user: SessionUser;
  /** Admin and team leaders may change things; gate leaders are read-mostly. */
  canManage: boolean;
  /** Non-null for a gate leader: they only see this one gate (spec §3.3). */
  gateId: string | null;
};

/**
 * Resolves what the current user may do inside one event.
 * Admin sees everything; anyone else needs an explicit event_access row.
 */
export async function resolveEventScope(
  eventId: string,
  user: SessionUser,
): Promise<EventScope | null> {
  if (user.role === 'ADMIN') {
    return { user, canManage: true, gateId: null };
  }
  const grant = await db.query.eventAccess.findFirst({
    where: and(eq(eventAccess.eventId, eventId), eq(eventAccess.userId, user.id)),
  });
  if (!grant) return null;
  return {
    user,
    canManage: grant.role === 'TEAM_LEADER',
    gateId: grant.gateId ?? null,
  };
}

export async function requireEventScope(eventId: string): Promise<EventScope> {
  const user = await requireUser();
  const scope = await resolveEventScope(eventId, user);
  if (!scope) redirect('/forbidden');
  return scope;
}

/** Server-action variant: throws ForbiddenError, never redirects. */
export async function assertEventManager(eventId: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new ForbiddenError();
  const scope = await resolveEventScope(eventId, user);
  if (!scope || !scope.canManage) throw new ForbiddenError();
  return user;
}

/**
 * Anyone with a part in this event: a manager, or a gate leader.
 *
 * Confirming that a man is standing at your gate is the gate leader's job by
 * definition — he is the one who can see him — so this is deliberately wider
 * than assertEventManager, and the caller still has to decide whether the
 * person being confirmed is at that gate.
 */
export async function assertEventStaff(eventId: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new ForbiddenError();
  const scope = await resolveEventScope(eventId, user);
  if (!scope) throw new ForbiddenError();
  return user;
}

/** Where a signed-in user's own home is. */
export function homeFor(role: Role): string {
  return role === 'ADMIN' ? '/admin' : '/leader';
}

/** URL prefix for the event workspace, per role. */
export function workspaceBase(role: Role): '/admin' | '/leader' {
  return role === 'ADMIN' ? '/admin' : '/leader';
}
