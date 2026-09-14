import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import * as schema from './schema';

/**
 * One driver, two homes.
 *
 * libSQL speaks to a local SQLite file (`file:./data/ops.db`) and to a hosted
 * Turso database (`libsql://…`) through the same client, so the laptop and the
 * deployed site run identical code — no second code path to keep honest, and
 * the schema never changes.
 */

declare global {
  // eslint-disable-next-line no-var
  var __opsDb: ReturnType<typeof createDb> | undefined;
}

function resolveUrl(): { url: string; authToken?: string } {
  const url =
    process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? 'file:./data/ops.db';
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (url.startsWith('file:')) {
    // A relative file: URL is relative to the project, not to the process, and
    // the folder has to exist before the file can be opened.
    const relative = url.slice('file:'.length);
    const absolute = path.isAbsolute(relative)
      ? relative
      : path.join(process.cwd(), relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    return { url: `file:${absolute}` };
  }

  if (!authToken) {
    throw new Error(
      'TURSO_AUTH_TOKEN is required when DATABASE_URL points at a hosted database.',
    );
  }
  return { url, authToken };
}

let client: ReturnType<typeof createClient> | undefined;

/** The underlying libSQL client, for the few statements drizzle has no builder for. */
export function rawClient() {
  client ??= createClient(resolveUrl());
  return client;
}

function createDb() {
  return drizzle(rawClient(), { schema });
}

/**
 * Cached on globalThis: in development Next.js reloads modules on every edit,
 * and on a serverless host the same instance answers many requests.
 */
export const db = globalThis.__opsDb ?? createDb();
globalThis.__opsDb = db;

export { schema };
export * from './schema';
