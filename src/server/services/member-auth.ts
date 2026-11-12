import 'server-only';

import { createHash, randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { and, desc, eq, gte, isNull } from 'drizzle-orm';

import { db } from '@/db';
import {
  memberLoginAttempts,
  memberSessions,
  pushSubscriptions,
  teamMembers,
} from '@/db/schema';
import { newId } from '@/lib/ids';

/**
 * How a promoter signs in.
 *
 * He types his phone number and a four-digit code once, and the session this
 * creates remembers him for a year. That is the whole design, and the reasons
 * are in docs/PROMOTER-LOGIN.md: a code and a session beat a secret carried in
 * a URL, because the install on a phone then points at the site itself rather
 * than at one man's token, rotating a code does not break an installed app,
 * and the session is a device binding for free.
 *
 * None of this touches `users`. Supervisors and leaders sign in through
 * server/auth/session.ts with a different cookie and a different lookup, and
 * there is no path between the two.
 */

export const MEMBER_COOKIE = 'ops_member';
const SESSION_DAYS = 365;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;

/** Five tries, then a quarter of an hour of silence. */
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

/**
 * The phone as the system files it: digits only, country code and leading
 * zeroes removed, so +964 770 123 4567, 07701234567 and 7701234567 are one
 * person. Shared with the roster import, which matches people the same way.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('964')) digits = digits.slice(3);
  digits = digits.replace(/^0+/, '');
  return digits.length >= 8 ? digits : null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/* ------------------------------------------------------------------------ */
/* Codes                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Issues a code and returns it in the clear — once.
 *
 * The caller shows it to the supervisor so it can go into a WhatsApp message,
 * and nothing stores it. Asking for it again issues a new one, which is the
 * honest behaviour: a code nobody can read back is a code nobody can leak.
 */
export async function issueAccessCode(teamMemberId: string): Promise<string> {
  const code = String(randomInt(0, 10000)).padStart(4, '0');
  await db
    .update(teamMembers)
    .set({
      accessCodeHash: bcrypt.hashSync(code, 10),
      accessCodeSetAt: new Date(),
      accessCodeRevokedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(teamMembers.id, teamMemberId));
  return code;
}

/**
 * Takes the code away, ends every session it opened, and stops the phones.
 *
 * A subscription outlives a session — the browser keeps it, and the push
 * service does not know anybody signed out — so a man whose code is revoked
 * would go on being told about events he is no longer on. The rows are what
 * we control, so the rows go.
 */
export async function revokeAccessCode(teamMemberId: string): Promise<void> {
  await db
    .update(teamMembers)
    .set({ accessCodeRevokedAt: new Date(), updatedAt: new Date() })
    .where(eq(teamMembers.id, teamMemberId));
  await revokeMemberSessions(teamMemberId);
  await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.teamMemberId, teamMemberId));
}

export async function revokeMemberSessions(teamMemberId: string): Promise<number> {
  const open = await db
    .select({ id: memberSessions.id })
    .from(memberSessions)
    .where(
      and(eq(memberSessions.teamMemberId, teamMemberId), isNull(memberSessions.revokedAt)),
    );
  if (open.length === 0) return 0;
  await db
    .update(memberSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(memberSessions.teamMemberId, teamMemberId), isNull(memberSessions.revokedAt)),
    );
  return open.length;
}

/* ------------------------------------------------------------------------ */
/* Rate limiting                                                            */
/* ------------------------------------------------------------------------ */

export async function isLockedOut(key: string): Promise<boolean> {
  const since = new Date(Date.now() - LOCKOUT_MINUTES * 60_000);
  const rows = await db
    .select({ succeeded: memberLoginAttempts.succeeded })
    .from(memberLoginAttempts)
    .where(
      and(eq(memberLoginAttempts.phoneKey, key), gte(memberLoginAttempts.attemptedAt, since)),
    )
    .orderBy(desc(memberLoginAttempts.attemptedAt));

  /*
   * Counted back only as far as the last success: a man who got in and then
   * fumbled his code on a new phone starts from zero, not from whatever he
   * had used up that afternoon.
   */
  let failures = 0;
  for (const row of rows) {
    if (row.succeeded) break;
    failures += 1;
  }
  return failures >= MAX_ATTEMPTS;
}

export async function recordAttempt(key: string, succeeded: boolean): Promise<void> {
  await db.insert(memberLoginAttempts).values({
    id: newId(),
    phoneKey: key,
    attemptedAt: new Date(),
    succeeded,
  });
}

/* ------------------------------------------------------------------------ */
/* Signing in                                                               */
/* ------------------------------------------------------------------------ */

export type SignInResult =
  | { ok: true; teamMemberId: string; name: string }
  | { ok: false; reason: 'INVALID' | 'LOCKED' };

/**
 * Checks a phone and a code.
 *
 * Every failure looks the same from outside — wrong number, wrong code,
 * no code issued, person deactivated — because saying which one was wrong
 * tells a stranger whether a phone number is on the team.
 */
export async function signInMember(
  rawPhone: string,
  rawCode: string,
  deviceLabel: string | null,
): Promise<SignInResult> {
  const key = phoneKey(rawPhone);
  const code = rawCode.replace(/\D/g, '');
  if (!key || code.length !== 4) return { ok: false, reason: 'INVALID' };

  if (await isLockedOut(key)) return { ok: false, reason: 'LOCKED' };

  const member = await db
    .select({
      id: teamMembers.id,
      fullName: teamMembers.fullName,
      phone: teamMembers.phone,
      active: teamMembers.active,
      hash: teamMembers.accessCodeHash,
      revokedAt: teamMembers.accessCodeRevokedAt,
    })
    .from(teamMembers)
    .where(eq(teamMembers.active, true))
    .then((rows) => rows.find((row) => phoneKey(row.phone) === key));

  const usable =
    member && member.active && member.hash !== null && member.revokedAt === null;

  /*
   * Hashed even when there is nobody to check against, so that an unknown
   * number does not answer faster than a known one.
   */
  const matches = usable
    ? bcrypt.compareSync(code, member!.hash!)
    : (bcrypt.compareSync(code, DUMMY_HASH), false);

  await recordAttempt(key, matches);
  if (!matches) return { ok: false, reason: 'INVALID' };

  await createMemberSession(member!.id, deviceLabel);
  return { ok: true, teamMemberId: member!.id, name: member!.fullName };
}

/** A real bcrypt hash of a value nothing will ever submit. */
const DUMMY_HASH = bcrypt.hashSync('----', 10);

/* ------------------------------------------------------------------------ */
/* Sessions                                                                 */
/* ------------------------------------------------------------------------ */

export async function createMemberSession(
  teamMemberId: string,
  deviceLabel: string | null,
): Promise<void> {
  const raw = randomBytes(32).toString('hex');
  const now = new Date();

  await db.insert(memberSessions).values({
    id: newId(),
    teamMemberId,
    tokenHash: sha256(raw),
    deviceLabel: deviceLabel?.slice(0, 120) ?? null,
    createdAt: now,
    lastSeenAt: now,
    revokedAt: null,
  });

  const store = await cookies();
  store.set(MEMBER_COOKIE, raw, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
}

export type MemberIdentity = { teamMemberId: string; name: string; sessionId: string };

/**
 * Who is holding this browser, or null.
 *
 * The only way any promoter page or action learns who it is working for.
 * Reading it from a token in the address was the old way and is the thing
 * this replaces.
 */
export async function currentMember(): Promise<MemberIdentity | null> {
  const store = await cookies();
  const raw = store.get(MEMBER_COOKIE)?.value;
  if (!raw || raw.length !== 64) return null;

  const row = await db
    .select({
      sessionId: memberSessions.id,
      revokedAt: memberSessions.revokedAt,
      createdAt: memberSessions.createdAt,
      teamMemberId: teamMembers.id,
      name: teamMembers.fullName,
      active: teamMembers.active,
      codeRevokedAt: teamMembers.accessCodeRevokedAt,
    })
    .from(memberSessions)
    .innerJoin(teamMembers, eq(memberSessions.teamMemberId, teamMembers.id))
    .where(eq(memberSessions.tokenHash, sha256(raw)))
    .get();

  if (!row) return null;
  if (row.revokedAt !== null) return null;
  if (!row.active || row.codeRevokedAt !== null) return null;
  if (Date.now() - row.createdAt.getTime() > SESSION_SECONDS * 1000) return null;

  return { teamMemberId: row.teamMemberId, name: row.name, sessionId: row.sessionId };
}

/** Marks the session as used, so an idle one can be told from a live one. */
export async function touchMemberSession(sessionId: string): Promise<void> {
  await db
    .update(memberSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(memberSessions.id, sessionId));
}

export async function signOutMember(): Promise<void> {
  const store = await cookies();
  const raw = store.get(MEMBER_COOKIE)?.value;
  if (raw && raw.length === 64) {
    await db
      .update(memberSessions)
      .set({ revokedAt: new Date() })
      .where(eq(memberSessions.tokenHash, sha256(raw)));
  }
  store.delete(MEMBER_COOKIE);
}
