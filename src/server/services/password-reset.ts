import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { passwordResets, users } from '@/db/schema';
import { newId } from '@/lib/ids';

/**
 * One-time links for choosing a new office password.
 *
 * The link is the whole credential, so it is long, random, kept only as a
 * hash, good for an hour, and good once. An hour is long enough to send it
 * over WhatsApp and have it opened, and short enough that a link forgotten in
 * a chat is not a standing key to the account.
 */

export const RESET_MINUTES = 60;

const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Makes a link for this account and cancels any earlier one.
 *
 * Cancelling matters: asked twice, a supervisor has two links in his chat,
 * and the one he does not use would otherwise stay open for the hour.
 */
export async function issueReset(userId: string, issuedById: string): Promise<string> {
  const now = new Date();
  await db
    .update(passwordResets)
    .set({ usedAt: now })
    .where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)));

  const token = randomBytes(32).toString('base64url');
  await db.insert(passwordResets).values({
    id: newId(),
    userId,
    tokenHash: hashOf(token),
    issuedById,
    createdAt: now,
    expiresAt: new Date(now.getTime() + RESET_MINUTES * 60_000),
  });
  return token;
}

export type OpenReset = { id: string; userId: string; name: string; username: string };

/**
 * The reset this link opens, or null — and null for every reason alike.
 *
 * Unknown, used, expired, replaced, or belonging to an account since
 * disabled: the page says one thing for all of them, because telling them
 * apart tells a stranger with a guessed link which guesses were warm.
 */
export async function openReset(token: string): Promise<OpenReset | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const row = await db
    .select({
      id: passwordResets.id,
      userId: passwordResets.userId,
      expiresAt: passwordResets.expiresAt,
      usedAt: passwordResets.usedAt,
      name: users.name,
      username: users.username,
      active: users.active,
    })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(eq(passwordResets.tokenHash, hashOf(token)))
    .get();
  if (!row || row.usedAt || !row.active || row.expiresAt.getTime() <= Date.now()) return null;
  return { id: row.id, userId: row.userId, name: row.name, username: row.username };
}

/**
 * Spends the link. False if somebody else spent it first: the update only
 * lands on a row that is still unused, so two tabs racing cannot both win.
 */
export async function spendReset(id: string): Promise<boolean> {
  const spent = await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResets.id, id), isNull(passwordResets.usedAt)))
    .returning({ id: passwordResets.id });
  return spent.length === 1;
}
