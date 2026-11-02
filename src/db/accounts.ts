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
  /**
   * The password used when the environment does not set one.
   *
   * It is a first-use password and nothing more: the person it is handed to
   * changes it from the settings screen the first time they sign in, and from
   * then on this file does not describe their account.
   *
   * Optional, because a real deployment can set the variable instead and keep
   * the password out of the repository altogether — worth doing for anyone
   * who will not change theirs promptly, since a password written here stays
   * readable in the history after it is changed. An account with neither a
   * variable nor a fallback is not created at all, and setup says which
   * variable it is waiting for.
   */
  fallbackPassword?: string;
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
    username: 'mustafa',
    name: 'Mustafa Asad',
    email: 'mustafa@operations.local',
    role: 'ADMIN',
    envVar: 'SEED_MUSTAFA_PASSWORD',
    fallbackPassword: 'Mustafa@12345',
  },
  {
    username: 'ameer',
    name: 'Ameer Dawod',
    email: 'ameer@operations.local',
    role: 'ADMIN',
    envVar: 'SEED_AMEER_PASSWORD',
    fallbackPassword: 'Ameer@12345',
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
    // A gate supervisor by name, alongside the placeholder one below.
    username: 'raad',
    name: 'Mohamed Raad',
    email: 'raad@operations.local',
    role: 'GATE_LEADER',
    envVar: 'SEED_RAAD_PASSWORD',
    fallbackPassword: 'Raad@12345',
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

/** The password to create this account with, or null if there is none to use. */
export function passwordFor(account: StandingAccount): string | null {
  return process.env[account.envVar] ?? account.fallbackPassword ?? null;
}

export function rowFor(account: StandingAccount) {
  const password = passwordFor(account);
  if (password === null) {
    throw new Error(`No password configured for ${account.username}`);
  }
  return {
    id: newId(),
    username: account.username,
    email: account.email,
    name: account.name,
    passwordHash: bcrypt.hashSync(password, 10),
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

  /*
   * Missing, and possible to create. An account whose password lives only in
   * the environment is skipped until that variable is set, rather than being
   * created with something guessable — see fallbackPassword above. Running
   * setup again once the variable is there creates it.
   */
  const missing = STANDING_ACCOUNTS.filter(
    (account) =>
      !taken.has(account.username.toLowerCase()) && passwordFor(account) !== null,
  );
  if (missing.length === 0) return [];

  await db.insert(users).values(missing.map(rowFor));
  return missing.map((account) => account.username);
}

/**
 * Accounts this system is waiting on a password for, so setup can say so
 * rather than silently doing nothing.
 */
export function accountsAwaitingPassword(taken: Set<string>): string[] {
  return STANDING_ACCOUNTS.filter(
    (account) =>
      !taken.has(account.username.toLowerCase()) && passwordFor(account) === null,
  ).map((account) => `${account.username} (${account.envVar})`);
}
