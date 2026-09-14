# Moving to PostgreSQL / Supabase

The schema was written to be portable: only `text`, `integer`, `real` and
boolean/timestamp modes are used, with no SQLite-specific types. Switching
databases is a dialect change plus a connection string — the application code,
the queries and the services stay exactly as they are.

Budget about half an hour.

---

## 1. Install the driver

```bash
npm install postgres
npm uninstall better-sqlite3 @types/better-sqlite3
```

`postgres` (postgres.js) works with Supabase's pooler and with any plain
PostgreSQL server.

## 2. Point the schema at the Postgres dialect

In `src/db/schema.ts`, change the import and the table builder:

```diff
-import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
+import { pgTable, text, integer, doublePrecision, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
```

Then the four column shapes that differ:

| SQLite (now)                                  | PostgreSQL                                  |
| --------------------------------------------- | ------------------------------------------- |
| `integer('active', { mode: 'boolean' })`       | `boolean('active')`                         |
| `integer('created_at', { mode: 'timestamp_ms' })` | `timestamp('created_at', { withTimezone: true })` |
| `real('x')`                                    | `doublePrecision('x')`                      |
| `sqliteTable(...)`                             | `pgTable(...)`                              |

`text`, `integer` and every index/unique declaration carry over unchanged. The
`$defaultFn`/`.default(...)` clauses become `defaultNow()` for timestamps.

A find-and-replace handles most of it; there are 15 tables.

## 3. Swap the connection

`src/db/index.ts`:

```ts
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
export const db = drizzle(client, { schema });
```

`prepare: false` is required when going through Supabase's transaction pooler.

## 4. Swap the seed connection

`src/db/seed.ts` opens its own connection — change the same two lines there.
The seed's content needs no edits.

## 5. Update drizzle config and env

`drizzle.config.ts`:

```diff
-  dialect: 'sqlite',
+  dialect: 'postgresql',
```

`.env`:

```
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
```

Use the **direct connection** string for migrations and the **pooler** string
for the running app if you are on Supabase.

## 6. Create the tables

```bash
npx drizzle-kit generate     # writes SQL migrations to ./drizzle
npx drizzle-kit migrate      # applies them
npm run db:seed
```

---

## Constraints worth adding on PostgreSQL

SQLite cannot express these, so they live in the service layer today
(`src/server/services/assignments.ts`). On PostgreSQL, add them as real
constraints too — defence in depth, not a replacement for the server checks:

```sql
-- An assignment points at exactly one location, never both and never neither.
alter table assignments add constraint assignments_one_location
  check ((gate_id is null) <> (working_point_id is null));

-- Staffing numbers are never negative.
alter table gates          add constraint gates_required_staff_nonneg check (required_staff >= 0);
alter table working_points add constraint wp_required_staff_nonneg    check (required_staff >= 0);

-- Map markers stay inside the image.
alter table map_markers add constraint map_markers_bounds
  check (x between 0 and 1 and y between 0 and 1);

-- Status columns only ever hold known values.
alter table events add constraint events_status_valid
  check (status in ('DRAFT','PLANNING','READY','LIVE','COMPLETED','ARCHIVED'));
```

---

## If you also want Supabase Auth, Storage and Realtime

These are independent of the database swap and each is optional.

**Auth.** The app currently issues its own signed session cookie. To move to
Supabase Auth, replace the three functions in `src/server/auth/session.ts`
(`createSession`, `destroySession`, `readSession`) with Supabase's server
client. Everything else — `requireRole`, `resolveEventScope`, the `event_access`
table — stays as is, because roles and event scoping are *this application's*
concepts, not the auth provider's.

**Storage.** `src/app/api/uploads/map/route.ts` writes to `public/uploads/`.
Swap the `fs.writeFile` call for a Supabase Storage upload and store the
returned public URL in `venues.map_image_url`. Keep the authorization checks at
the top of that route — they are the actual boundary. Make the bucket private
and serve signed URLs if venue maps are sensitive.

**Realtime.** Announcements and attendance are read on each request today. To
push them live, subscribe to the `announcements` and `attendance` tables on the
client and call `router.refresh()` when a row arrives. Nothing in the write
path needs to change.

**Row Level Security.** If the browser ever talks to PostgREST directly, enable
RLS on every table before it does. The policies mirror the rules already
enforced in `src/server/auth/rbac.ts`:

- `events`, `gates`, `assignments`, … — readable when the user is an admin, or
  has a row in `event_access` for that `event_id`
- `event_members.token` — never exposed to the browser at all; the member
  portal reads it server-side only
- `audit_logs` — insert-only, never updatable or deletable

While all database access goes through the server (as it does now), RLS is a
second layer rather than the primary control.

---

## What does not change

- Every query, service and server action
- The i18n dictionaries, the UI, the map
- `"HH:mm"` and `"YYYY-MM-DD"` string storage — still the right call on
  PostgreSQL, for the same reason: an arrival time is a clock time, not an
  instant, and must not drift with a timezone
