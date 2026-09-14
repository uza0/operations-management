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
    .replace(/^CREATE INDEX\s+`/i, 'CREATE INDEX IF NOT EXISTS `'),
);

const out = `/**
 * GENERATED FILE — do not edit.
 * Produced by scripts/embed-schema.mjs from ${files.join(', ')}.
 * Regenerate after changing src/db/schema.ts:
 *   npx drizzle-kit generate && node scripts/embed-schema.mjs
 */

export const SCHEMA_STATEMENTS: string[] = [
${safe.map((s) => '  ' + JSON.stringify(s) + ',').join('\n')}
];
`;

fs.writeFileSync('src/db/schema-sql.ts', out);
console.log(`Embedded ${safe.length} statements into src/db/schema-sql.ts`);
