/**
 * Command-line wrapper around the demo data.
 *
 *   npm run db:seed        fills the database the environment points at
 *   npm run setup          creates the tables first, then fills them
 *
 * Which database: the local file by default, or the hosted Turso database when
 * TURSO_DATABASE_URL is set. The seeding itself lives in seed-core.ts, because
 * the deployed site runs the same code from its first-run setup route.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import * as schema from './schema';
import { seedDemoData } from './seed-core';

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

seedDemoData({ db, sql })
  .then((result) => {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    console.log('\n✔ Demo data ready\n');
    console.log('  Accounts');
    console.log(`    admin        ${result.adminUsername} / ${result.adminPassword}`);
    console.log(`    team leader  ${result.leaderUsername} / ${result.leaderPassword}`);
    console.log(`    team leader  sara / ${result.leaderPassword}`);
    console.log(`    gate leader  hussein / ${result.gatePassword}   (gate 3 only)`);
    console.log('\n  Member portal (أمير عبد الله — starts at Gate 4)');
    console.log(`    ${base}/member/${result.memberToken}\n`);
    sql.close();
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    sql.close();
    process.exit(1);
  });
