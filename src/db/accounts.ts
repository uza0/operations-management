import bcrypt from 'bcryptjs';

import * as schema from './schema';
import { newId } from '../lib/ids';

/**
 * The accounts the system is expected to have.
 *
 * The app deliberately has no screen for creating users — who may sign in is a
 * decision made once, not an everyday operation — so the list lives here and is
 * applied on setup. It is applied by ADDING what is missing and never by
 * overwriting: an account that already exists keeps its password, its name and
 * whether it is active, because the person using it may well have changed all
 * three since it was created.
 *
 * Passwords here are first-use passwords. Each person changes their own from
 * the settings screen the first time they sign in, and after that this file no
 * longer describes their account at all.
 */

export type StandingAccount = {
  username: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'TEAM_LEADER' | 'GATE_LEADER';
  /** Read from the environment first, so a real deployment need not use this. */
  envVar: string;
  fallbackPassword: string;
};

export const STANDING_ACCOUNTS: StandingAccount[] = [
  {
    username: 'admin',
    name: 'مشرف العمليات',
    email: 'admin@operations.local',
    role: 'ADMIN',
    envVar: 'SEED_ADMIN_PASSWORD',
    fallbackPassword: 'Admin@12345',
  },
  {
    // The operations manager, alongside the developer's own account.
    username: 'numan',
    name: 'Mohamed Numan',
    email: 'numan@operations.local',
    role: 'ADMIN',
    envVar: 'SEED_NUMAN_PASSWORD',
    fallbackPassword: 'Numan@12345',
  },
  {
    username: 'leader',
    name: 'قائد الفريق',
    email: 'leader@operations.local',
    role: 'TEAM_LEADER',
    envVar: 'SEED_LEADER_PASSWORD',
    fallbackPassword: 'Leader@12345',
  },
  {
    username: 'gate',
    name: 'قائد بوابة',
    email: 'gate@operations.local',
    role: 'GATE_LEADER',
    envVar: 'SEED_GATELEADER_PASSWORD',
    fallbackPassword: 'Gate@12345',
  },
];

export function passwordFor(account: StandingAccount): string {
  return process.env[account.envVar] ?? account.fallbackPassword;
}

export function rowFor(account: StandingAccount) {
  return {
    id: newId(),
    username: account.username,
    email: account.email,
    name: account.name,
    passwordHash: bcrypt.hashSync(passwordFor(account), 10),
    role: account.role,
    active: true,
    teamMemberId: null,
  };
}

/**
 * Creates any standing account the database does not have yet.
 *
 * Safe to run against a live database on every deploy: it reads the usernames
 * that exist and inserts only the ones that do not, so it adds a new colleague
 * without disturbing anybody already working.
 */
export async function ensureStandingAccounts(db: {
  select: (fields: Record<string, unknown>) => {
    from: (table: unknown) => Promise<{ username: string }[]>;
  };
  insert: (table: unknown) => { values: (rows: unknown[]) => Promise<unknown> };
}): Promise<string[]> {
  const { users } = schema;
  const existing = await db
    .select({ username: users.username })
    .from(users);
  const taken = new Set(existing.map((row) => row.username.toLowerCase()));

  const missing = STANDING_ACCOUNTS.filter(
    (account) => !taken.has(account.username.toLowerCase()),
  );
  if (missing.length === 0) return [];

  await db.insert(users).values(missing.map(rowFor));
  return missing.map((account) => account.username);
}
