/**
 * Turns the drizzle-kit migration into a TypeScript module the app can run
 * itself.
 *
 * Why not read the .sql at runtime: a serverless bundle only contains what the
 * bundler can see, and a folder read with fs is invisible to it. Embedding the
 * statements makes first-run setup work on any host, with no file access and
 * no CLI.
 *
 *   node scripts/embed-schema.mjs      (after every `npx drizzle-kit generate`)
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = 'drizzle';
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.error('No .sql files in drizzle/ — run `npx drizzle-kit generate` first.');
  process.exit(1);
}

const statements = [];
for (const file of files) {
  const sql = fs.readFileSync(path.join(dir, file), 'utf8');
  for (const part of sql.split('--> statement-breakpoint')) {
    const trimmed = part.trim();
    if (trimmed) statements.push(trimmed.replace(/;\s*$/, ''));
  }
}

// CREATE TABLE → CREATE TABLE IF NOT EXISTS, so running setup twice is safe.
const safe = statements.map((s) =>
  s
    .replace(/^CREATE TABLE\s+`/i, 'CREATE TABLE IF NOT EXISTS `')
    .replace(/^CREATE UNIQUE INDEX\s+`/i, 'CREATE UNIQUE INDEX IF NOT EXISTS `')
    .replace(/^CREATE INDEX\s+`/i, 'CREATE INDEX IF NOT EXISTS `')
    /*
     * A dropped index is dropped once. On a database that never had it — a
     * fresh one, or one set up after the change — "no such index" is not a
     * failure, and IF EXISTS says so in the statement rather than leaving the
     * setup route to recognise the wording of an error message.
     */
    .replace(/^DROP INDEX\s+`/i, 'DROP INDEX IF EXISTS `'),
);

/*
 * An index that a later migration drops is never created at all.
 *
 * These statements are replayed in order against a database that already has
 * data in it, and "IF NOT EXISTS" does not save a UNIQUE index from the rows
 * that now break it. The chair-setting day was the real case: migration 11
 * made one day per event unique, migration 16 removed that so a hall could be
 * built over three afternoons — and from then on, replaying the list against
 * any database that actually had two chair days failed on the create, before
 * the drop a dozen lines later could undo it. The whole upgrade stopped
 * there, so every column added afterwards was silently never added.
 *
 * Dropping the pair is both correct and quieter than ordering around it: an
 * index created and then dropped is an index this schema does not have.
 */
const droppedIndexes = new Set(
  safe
    .map((s) => /^DROP INDEX IF EXISTS `([^`]+)`/i.exec(s)?.[1])
    .filter((name) => Boolean(name)),
);

const pruned = safe.filter((s) => {
  const created = /^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS `([^`]+)`/i.exec(s)?.[1];
  const dropped = /^DROP INDEX IF EXISTS `([^`]+)`/i.exec(s)?.[1];
  const name = created ?? dropped;
  return !(name && droppedIndexes.has(name));
});

const removed = safe.length - pruned.length;
if (removed > 0) {
  console.log(
    `Pruned ${removed} statement(s) for indexes a later migration drops: ` +
      [...droppedIndexes].join(', '),
  );
}

const out = `/**
 * GENERATED FILE — do not edit.
 * Produced by scripts/embed-schema.mjs from ${files.join(', ')}.
 * Regenerate after changing src/db/schema.ts:
 *   npx drizzle-kit generate && node scripts/embed-schema.mjs
 */

export const SCHEMA_STATEMENTS: string[] = [
${pruned.map((s) => '  ' + JSON.stringify(s) + ',').join('\n')}
];
`;

fs.writeFileSync('src/db/schema-sql.ts', out);
console.log(`Embedded ${pruned.length} statements into src/db/schema-sql.ts`);
