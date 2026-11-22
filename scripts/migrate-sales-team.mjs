/** Targeted migration 0042. Read-only by default; --apply writes atomically.
 * Credentials are read from the process or .env, never printed.
 * Never runs setup, seed, db:push, or historical migrations.
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

const root = new URL('../', import.meta.url);
const migration = fs.readFileSync(new URL('drizzle/0042_petite_jack_flag.sql', root), 'utf8')
  .split('--> statement-breakpoint').map(s => s.trim().replace(/;\s*$/, ''));
const embedded = fs.readFileSync(new URL('src/db/schema-sql.ts', root), 'utf8');
const statements = JSON.parse(embedded.slice(embedded.indexOf('[\n'), embedded.lastIndexOf('];') + 1).replace(/,\s*\]$/, ']'));
const migrationStart = statements.indexOf(migration[0]);
const releaseCounter = migrationStart + migration.length;
if (migration.length !== 2 || migrationStart < 0 || !migration.every((s, i) => s === statements[migrationStart + i])) {
  throw new Error('Migration does not match the release schema; review required.');
}
const count = async (c, table) => Number((await c.execute(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n);
const digest = rows => createHash('sha256').update(JSON.stringify(rows, (_, v) => typeof v === 'bigint' ? String(v) : v)).digest('hex');

export async function migrateSalesTeam(client, { apply = false } = {}) {
  const tx = await client.transaction(apply ? 'write' : 'read');
  try {
    const columns = (await tx.execute('PRAGMA table_info(event_members)')).rows;
    const hasSales = columns.some(c => c.name === 'sales_role');
    const version = Number((await tx.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: ['schema_statements'] })).rows[0]?.value ?? 0);
    if (version < migrationStart || version > statements.length) {
      throw new Error('Schema counter is outside release 0041/0042; review earlier migrations before applying.');
    }
    const eligible = Number((await tx.execute("SELECT count(*) AS n FROM events WHERE pay_default = 30000 AND date >= '2026-11-22'")).rows[0].n);
    const chairs = (await tx.execute('SELECT pay_amount, count(*) AS n FROM seat_setup_details GROUP BY pay_amount ORDER BY pay_amount')).rows.map(r => ({ amount: Number(r.pay_amount), rows: Number(r.n) }));
    const eventColumnDefault = (await tx.execute('PRAGMA table_info(events)')).rows.find(c => c.name === 'pay_default')?.dflt_value ?? null;
    const result = { mode: apply ? 'apply' : 'check', salesColumn: hasSales, schemaCounter: version, releaseCounter, eventsToUpdate: eligible, eventColumnDefault, chairRates: chairs };
    if (!apply) { await tx.rollback(); return result; }

    const protectedTables = ['event_members', 'seat_setup_details', 'seat_setup_members', 'payouts'];
    const protectedBefore = new Map();
    for (const table of protectedTables) {
      // Verify every pre-existing membership column, including sales_role if present.
      const projection = table === 'event_members'
        ? columns.map(c => `"${c.name}"`).join(',')
        : '*';
      protectedBefore.set(table, { projection, hash: digest((await tx.execute(`SELECT ${projection} FROM "${table}" ORDER BY id`)).rows) });
    }
    const eventsBefore = (await tx.execute('SELECT * FROM events ORDER BY id')).rows;
    const eventCount = await count(tx, 'events');
    if (!hasSales) await tx.execute(migration[0]);
    const updated = await tx.execute(migration[1]);
    if (updated.rowsAffected !== eligible) throw new Error('Unexpected affected event count; rolled back.');
    for (const [table, saved] of protectedBefore) {
      if (digest((await tx.execute(`SELECT ${saved.projection} FROM "${table}" ORDER BY id`)).rows) !== saved.hash) {
        throw new Error('Protected payroll or chair data changed; rolled back.');
      }
    }
    const eventsAfter = (await tx.execute('SELECT * FROM events ORDER BY id')).rows;
    const expectedEvents = eventsBefore.map(r => {
      const expected = Number(r.pay_default) === 30000 && r.date >= '2026-11-22' ? 35000 : Number(r.pay_default);
      return { ...r, pay_default: expected };
    });
    if (eventCount !== await count(tx, 'events') || digest(eventsAfter) !== digest(expectedEvents)) {
      throw new Error('Event verification failed; rolled back.');
    }
    if (!(await tx.execute('PRAGMA table_info(event_members)')).rows.some(c => c.name === 'sales_role')) {
      throw new Error('Sales column verification failed; rolled back.');
    }
    // Only advance from this release's verified immediate predecessor.
    await tx.execute({ sql: 'UPDATE settings SET value = ?, updated_at = ? WHERE key = ?', args: [String(Math.max(version, releaseCounter)), Date.now(), 'schema_statements'] });
    await tx.commit();
    return { ...result, salesColumn: true, schemaCounter: Math.max(version, releaseCounter), eventsUpdated: updated.rowsAffected, protectedDataUnchanged: true };
  } catch (error) {
    if (!tx.closed) await tx.rollback();
    throw error;
  } finally { tx.close(); }
}

async function main() {
  const envFile = new URL('../.env', import.meta.url);
  const env = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};
  const url = process.env.TURSO_DATABASE_URL || env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    console.error('BLOCKED: configure TURSO_DATABASE_URL and TURSO_AUTH_TOKEN privately in .env or the process environment. Never send them in chat.');
    process.exitCode = 2;
    return;
  }
  if (!/^(libsql|https):\/\//.test(url)) throw new Error('A remote Turso URL is required.');
  const client = createClient({ url, authToken });
  try { console.log(JSON.stringify(await migrateSalesTeam(client, { apply: process.argv.includes('--apply') }), null, 2)); }
  finally { client.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // Driver errors can contain URLs and request details. Never print raw errors.
    const safe = /^(Schema counter|Unexpected affected|Protected payroll|Event verification|Sales column verification|A remote Turso)/.test(error.message);
    console.error(safe ? error.message : 'Migration failed; no credentials or raw connection errors are printed. Check network access and database token permissions.');
    process.exitCode = 1;
  });
}
