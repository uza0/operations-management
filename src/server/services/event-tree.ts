import 'server-only';

import type { Client, InValue, Row } from '@libsql/client';

/**
 * An event and every row that hangs off it, as plain data.
 *
 * Deleting an event cascades through a dozen tables — its team, gates,
 * distribution, attendance, announcements, report — and new tables join that
 * list as the system grows. So the list is not written down here: it is read
 * from the database's own foreign keys every time. Whatever the delete would
 * remove, this collects; whatever it collected, `restoreEventTree` puts back.
 *
 * The same pair serves both ways an event comes back: from the copy kept at
 * deletion (`deleted_events`), and from a backup of the whole database taken
 * before the delete, for events deleted before that copy existed.
 */

export type EventTree = {
  version: 1;
  eventId: string;
  tables: Record<string, Record<string, unknown>[]>;
};

type ForeignKey = { table: string; from: string; parent: string; to: string; onDelete: string };

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function schemaOf(client: Client) {
  const result = await client.execute(
    "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '\\_\\_%' escape '\\' and name not like '\\_litestream%' escape '\\'",
  );
  const tables = result.rows.map((row) => String(row.name));
  const fks: ForeignKey[] = [];
  for (const table of tables) {
    const list = await client.execute(`pragma foreign_key_list(${quote(table)})`);
    for (const row of list.rows) {
      fks.push({
        table,
        from: String(row.from),
        parent: String(row.table),
        to: String(row.to ?? 'id'),
        onDelete: String(row.on_delete ?? 'NO ACTION').toUpperCase(),
      });
    }
  }
  return { tables, fks };
}

/** Rows that disappear with their parent: everything except SET NULL / SET DEFAULT. */
const followsParent = (fk: ForeignKey) => fk.onDelete !== 'SET NULL' && fk.onDelete !== 'SET DEFAULT';

function plain(row: Row, columns: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const column of columns) {
    const value = row[column];
    if (value instanceof ArrayBuffer) {
      out[column] = { __blob: Buffer.from(value).toString('base64') };
    } else if (typeof value === 'bigint') {
      out[column] = Number(value);
    } else {
      out[column] = value;
    }
  }
  return out;
}

export async function collectEventTree(client: Client, eventId: string): Promise<EventTree | null> {
  const { fks } = await schemaOf(client);
  const tables: EventTree['tables'] = {};
  const seen = new Map<string, Set<string>>();

  const add = (table: string, rows: Record<string, unknown>[]) => {
    const keys = seen.get(table) ?? new Set<string>();
    seen.set(table, keys);
    const fresh = rows.filter((row) => {
      const key = JSON.stringify(row);
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
    if (fresh.length > 0) (tables[table] ??= []).push(...fresh);
    return fresh.length;
  };

  const root = await client.execute({ sql: 'select * from events where id = ?', args: [eventId] });
  if (root.rows.length === 0) return null;
  add('events', root.rows.map((row) => plain(row, root.columns)));

  // Walk down the foreign keys until nothing new turns up.
  for (let grew = true, guard = 0; grew && guard < 20; guard += 1) {
    grew = false;
    for (const fk of fks) {
      if (!followsParent(fk) || !tables[fk.parent]) continue;
      const values = [...new Set(tables[fk.parent].map((row) => row[fk.to]).filter((v) => v != null))];
      for (let i = 0; i < values.length; i += 200) {
        const chunk = values.slice(i, i + 200) as InValue[];
        const result = await client.execute({
          sql: `select * from ${quote(fk.table)} where ${quote(fk.from)} in (${chunk.map(() => '?').join(',')})`,
          args: chunk,
        });
        if (add(fk.table, result.rows.map((row) => plain(row, result.columns))) > 0) grew = true;
      }
    }
  }

  return { version: 1, eventId, tables };
}

/** Parents before children, so every row finds what it points at. */
function insertOrder(names: string[], fks: ForeignKey[]): string[] {
  const pending = new Set(names);
  const order: string[] = [];
  while (pending.size > 0) {
    const ready = [...pending].filter((table) =>
      fks.every((fk) => fk.table !== table || fk.parent === table || !pending.has(fk.parent)),
    );
    // A cycle: take one anyway. Foreign keys are checked at commit, not per row.
    const next = ready.length > 0 ? ready : [[...pending][0]];
    for (const table of next) {
      order.push(table);
      pending.delete(table);
    }
  }
  return order;
}

export async function restoreEventTree(
  client: Client,
  tree: EventTree,
): Promise<{ rows: number }> {
  const { tables: present, fks } = await schemaOf(client);
  const columnsOf = new Map<string, Set<string>>();
  for (const table of Object.keys(tree.tables)) {
    if (!present.includes(table)) continue;
    const info = await client.execute(`pragma table_info(${quote(table)})`);
    columnsOf.set(table, new Set(info.rows.map((row) => String(row.name))));
  }

  const statements: { sql: string; args: InValue[] }[] = [];
  for (const table of insertOrder([...columnsOf.keys()], fks)) {
    const known = columnsOf.get(table)!;
    for (const row of tree.tables[table]) {
      // Only columns this database still has: a backup can be a version behind.
      const columns = Object.keys(row).filter((column) => known.has(column));
      if (columns.length === 0) continue;
      const args = columns.map((column) => {
        const value = row[column] as unknown;
        if (value && typeof value === 'object' && '__blob' in (value as object)) {
          return Buffer.from(String((value as { __blob: string }).__blob), 'base64');
        }
        return value as InValue;
      });
      statements.push({
        sql: `insert or ignore into ${quote(table)} (${columns.map(quote).join(',')}) values (${columns.map(() => '?').join(',')})`,
        args,
      });
    }
  }

  // One transaction: the event comes back whole or not at all.
  await client.batch([{ sql: 'pragma defer_foreign_keys = on', args: [] }, ...statements], 'write');
  return { rows: statements.length };
}
