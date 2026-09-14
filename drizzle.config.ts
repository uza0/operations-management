import 'dotenv/config';
import type { Config } from 'drizzle-kit';

/**
 * Points at whichever database the environment names:
 *   • nothing set        → the local file, data/ops.db (zero configuration)
 *   • TURSO_DATABASE_URL → the hosted Turso database, for the deployed site
 *
 * The schema is identical either way; only the connection changes. Moving the
 * whole thing to PostgreSQL later is a dialect change — see
 * docs/POSTGRES_MIGRATION.md.
 */
const turso = process.env.TURSO_DATABASE_URL;

export default (
  turso
    ? {
        schema: './src/db/schema.ts',
        out: './drizzle',
        dialect: 'turso',
        dbCredentials: { url: turso, authToken: process.env.TURSO_AUTH_TOKEN! },
        strict: false,
        verbose: false,
      }
    : {
        schema: './src/db/schema.ts',
        out: './drizzle',
        dialect: 'sqlite',
        dbCredentials: { url: process.env.DATABASE_URL ?? 'file:./data/ops.db' },
        strict: false,
        verbose: false,
      }
) satisfies Config;
