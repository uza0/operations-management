/**
 * Command-line wrapper around the live install.
 *
 *   npm run db:seed:live     clears the database and loads the real roster
 *
 * Which database: the local file by default, or the hosted Turso database when
 * TURSO_DATABASE_URL is set. This WIPES whatever is there — it is the "start
 * the real system" command, not a top-up.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import * as schema from './schema';
import { seedLiveData } from './seed-live';

const url =
  process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? 'file:./data/ops.db';

function client() {
  if (url.startsWith('file:')) {
    const file = url.slice('file:'.length);
    const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    return createClient({ url: `file:${abs}` });
  }
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!authToken) throw new Error('TURSO_AUTH_TOKEN is required for a hosted database.');
  return createClient({ url, authToken });
}

const sql = client();
const db = drizzle(sql, { schema });

seedLiveData({ db, sql })
  .then((result) => {
    console.log(`\n✔ Live install ready — ${result.teamSize} team members\n`);
    console.log('  Accounts');
    console.log(`    admin        ${result.adminUsername} / ${result.adminPassword}`);
    console.log(`    team leader  ${result.leaderUsername} / ${result.leaderPassword}`);
    console.log(`    gate leader  ${result.gateUsername} / ${result.gatePassword}`);
    console.log('\n  Next: add a venue, then create the first event.\n');
    sql.close();
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    sql.close();
    process.exit(1);
  });
