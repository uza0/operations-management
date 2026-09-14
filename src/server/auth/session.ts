import 'server-only';

import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

import type { Role } from '@/lib/constants';

export const SESSION_COOKIE = 'ops_session';
const MAX_AGE_SECONDS = 60 * 60 * 12; // one operational shift + margin

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  role: Role;
};

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      'AUTH_SECRET is missing or too short. Set a random string of at least 32 characters in .env',
    );
  }
  return new TextEncoder().encode(value);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({
    sub: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Verifies the signed cookie. Returns null for anonymous or tampered sessions. */
export async function readSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || typeof payload.role !== 'string') return null;
    return {
      id: payload.sub,
      username: String(payload.username ?? ''),
      name: String(payload.name ?? ''),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}
