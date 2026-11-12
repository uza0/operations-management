import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';

import { db, rawClient } from '@/db';
import { SCHEMA_STATEMENTS } from '@/db/schema-sql';
import { users } from '@/db/schema';
import { accountsAwaitingPassword, ensureStandingAccounts } from '@/db/accounts';
import { teamMembers } from '@/db/schema';
import { seedDemoData } from '@/db/seed-core';
import { seedLiveData } from '@/db/seed-live';

/**
 * First-run setup for a deployed site: creates the tables and loads the demo
 * data, so a fresh database can be prepared from a browser without a terminal
 * or a local checkout.
 *
 * It is off unless `SETUP_KEY` is set, and it refuses to touch a database that
 * already has users unless `reset=1` is passed as well. Delete this file once
 * the site holds real data — it exists to make the first deploy possible, not
 * to stay.
 *
 *   GET /api/setup?key=<SETUP_KEY>                    create/upgrade only
 *   GET /api/setup?key=<SETUP_KEY>&reset=1            wipes, loads the real team
 *   GET /api/setup?key=<SETUP_KEY>&reset=1&demo=1     wipes, loads the demo
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function matches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // Compare something of equal length either way, so the answer time says
  // nothing about how much of the key was right.
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const expected = process.env.SETUP_KEY;
  // Not configured: the route does not exist as far as anyone can tell.
  if (!expected) return new NextResponse('Not found', { status: 404 });

  const url = new URL(request.url);
  const key = url.searchParams.get('key') ?? '';
  if (!matches(key, expected)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const reset = url.searchParams.get('reset') === '1';
  const demo = url.searchParams.get('demo') === '1';
  const client = rawClient();
  const created: string[] = [];
  const upgraded: string[] = [];

  try {
    for (const statement of SCHEMA_STATEMENTS) {
      const name = /`([a-z_]+)`/.exec(statement)?.[1];
      try {
        await client.execute(statement);
        if (statement.startsWith('CREATE TABLE') && name) created.push(name);
        if (statement.startsWith('ALTER TABLE')) {
          upgraded.push(/ADD `([a-z_]+)`/.exec(statement)?.[1] ?? statement);
        }
      } catch (error) {
        /*
         * A later release adds columns to tables that already exist, and those
         * ALTER statements have no "IF NOT EXISTS" form. Running setup a second
         * time therefore hits "duplicate column name", which means the upgrade
         * is already in place — not a failure. Anything else is real and
         * stops the run.
         */
        const message = error instanceof Error ? error.message : String(error);
        const alreadyApplied =
          /duplicate column name/i.test(message) || /already exists/i.test(message);
        if (!alreadyApplied) throw error;
      }
    }

    const existing = await db.get<{ count: number }>(
      sql`select count(*) as count from users`,
    );
    /*
     * Wiping a database that has accounts in it takes more than the link.
     *
     * The key rides in the URL, which means it sits in a browser's history
     * and in the host's request log, and the same link is opened after every
     * release. One stray `&reset=1` on it used to be the whole distance
     * between a routine update and an empty system. So a reset of a database
     * that is in use must also be switched on from the host's own settings,
     * by somebody who can reach them, and switched off again afterwards.
     */
    const inUse = (existing?.count ?? 0) > 0;
    if (inUse && reset && process.env.SETUP_ALLOW_RESET !== '1') {
      return NextResponse.json(
        {
          status: 'reset-refused',
          message:
            'This database is in use, so it was not wiped. Nothing was changed. To wipe it on purpose, set SETUP_ALLOW_RESET=1 in the host settings, redeploy, run this again, then remove the setting.',
        },
        { status: 409 },
      );
    }

    if (inUse && !reset) {
      /*
       * A release that adds a colleague to the standing account list must be
       * able to reach a database full of real work. Adding the missing ones is
       * safe in a way that reseeding is not: nothing already there is touched.
       */
      const addedAccounts = await ensureStandingAccounts(
        db as unknown as Parameters<typeof ensureStandingAccounts>[0],
      );
      /*
       * And the ones it could not create, by name and by the variable each is
       * waiting for. An account deliberately left uncreated until its password
       * is configured must say so here, or it looks exactly like a bug.
       */
      /*
       * How many people still need a sign-in code. Not issued here: a code
       * printed by a URL anybody with the key can fetch is not a code. The
       * supervisor issues them from the roster, one tap each or all at once.
       */
      const awaitingCodes = await db
        .select({ id: teamMembers.id, hash: teamMembers.accessCodeHash, active: teamMembers.active })
        .from(teamMembers)
        .then((rows) => rows.filter((row) => row.active && row.hash === null).length);

      const haveUsers = await db
        .select({ username: users.username })
        .from(users);
      const awaiting = accountsAwaitingPassword(
        new Set(haveUsers.map((row) => row.username.toLowerCase())),
      );
      return NextResponse.json({
        status: 'already-set-up',
        tables: created.length,
        // The schema upgrade above still ran, so say what it changed: this is
        // the path a live site takes when it is updated, not wiped.
        columnsAdded: upgraded,
        accountsAdded: addedAccounts,
        accountsAwaitingPassword: awaiting,
        membersAwaitingCode: awaitingCodes,
        users: (existing?.count ?? 0) + addedAccounts.length,
        message:
          upgraded.length > 0 || addedAccounts.length > 0
            ? 'The database already has accounts, so the data was kept. New columns and any new sign-in accounts were added so the site matches this release.'
            : 'The database already has accounts and is up to date, so nothing was changed.',
      });
    }

    /*
     * The real roster is the default, because this route now prepares a system
     * someone is going to use. The demonstration is still one query parameter
     * away, for showing the app to people before there is anything real in it.
     */
    if (demo) {
      const result = await seedDemoData({ db, sql: client });
      return NextResponse.json({
        status: 'ready',
        data: 'demo',
        tables: created.length,
        columnsAdded: upgraded,
        signIn: `${url.origin}/login`,
        accounts: {
          admin: `${result.adminUsername} / ${result.adminPassword}`,
          teamLeader: `${result.leaderUsername} / ${result.leaderPassword}`,
          gateLeader: `hussein / ${result.gatePassword}`,
        },
        memberLink: `${url.origin}/member/${result.memberToken}`,
        next: 'Delete this route, or unset SETUP_KEY, once you are done.',
      });
    }

    const result = await seedLiveData({ db, sql: client });

    return NextResponse.json({
      status: 'ready',
      data: 'live',
      tables: created.length,
      columnsAdded: upgraded,
      teamSize: result.teamSize,
      event: `${result.eventName} — ${result.locations} locations, ${result.assigned} assigned`,
      signIn: `${url.origin}/login`,
      accounts: result.credentials,
      next: 'Place the markers on the venue map, then delete this route or unset SETUP_KEY.',
    });
  } catch (error) {
    console.error('[setup]', error);
    return NextResponse.json(
      { status: 'failed', error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
