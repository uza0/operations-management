import 'server-only';

import { rawClient } from '@/db';
import { SCHEMA_STATEMENTS } from '@/db/schema-sql';

/**
 * Brings the live database up to this release's schema on its own.
 *
 * Until now every release that added a column needed somebody to open the
 * setup link straight after deploying, and the minutes in between were an
 * outage: the new code asked for a column the database did not have yet and
 * every page that touched that table fell over — the promoters' pages first.
 *
 * So the server does it as it starts. Cheap when there is nothing to do: one
 * read of a counter in `settings`. Only when the counter is behind the number
 * of statements this release carries are they run — every statement is
 * additive, and one that already ran answers "already exists", which is fine.
 * Never throws: a failure here is reported and the setup link still works.
 */
const KEY = 'schema_statements';

export async function ensureSchema(): Promise<void> {
  const client = rawClient();
  try {
    const row = await client.execute({
      sql: 'select value from settings where key = ?',
      args: [KEY],
    });
    if (Number(row.rows[0]?.value ?? 0) >= SCHEMA_STATEMENTS.length) return;
  } catch {
    /* No settings table yet: a new database, so run everything below. */
  }

  for (const statement of SCHEMA_STATEMENTS) {
    try {
      await client.execute(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/duplicate column name|already exists/i.test(message)) continue;
      console.error('[schema] upgrade stopped:', message);
      return;
    }
  }

  try {
    const now = Date.now();
    await client.execute({
      sql: `insert into settings (key, value, created_at, updated_at) values (?, ?, ?, ?)
            on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`,
      args: [KEY, String(SCHEMA_STATEMENTS.length), now, now],
    });
  } catch (error) {
    console.error('[schema] could not record the upgrade:', error);
  }
}
