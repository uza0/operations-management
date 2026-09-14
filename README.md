# Operations Management

**Event Team & Gate Operations Platform** — an internal tool for distributing
field staff across stadium gates and operational points, and for running the
event once it is live.

It is not a ticketing platform. It manages **people + places + tasks + time +
communication** around one event: venue → map → gates → team → assignments →
attendance → announcements → issues → report → archive.

Arabic-first (RTL), English secondary (LTR), mobile-first for the field team.

---

## Quick start

```bash
npm install
cp .env.example .env          # then set AUTH_SECRET to a long random string
npm run setup                 # creates the database and loads the demo event
npm run dev                   # http://localhost:3000
```

`npm run setup` prints the demo accounts and a working member link when it
finishes.

### Demo accounts

| Role        | Username  | Password       | Sees                              |
| ----------- | --------- | -------------- | --------------------------------- |
| Admin       | `admin`   | `Admin@12345`  | Everything                        |
| Team leader | `ahmed`   | `Leader@12345` | Only the events granted to him    |
| Team leader | `sara`    | `Leader@12345` | Only the concert                  |
| Gate leader | `hussein` | `Gate@12345`   | Only Gate 3 of the live match     |

Team members have no account at all. They open a secure personal link,
`/member/<token>` — copy one from **Event → Team**, or use the link the seed
prints.

> These are the local defaults. Set `SEED_ADMIN_PASSWORD`,
> `SEED_LEADER_PASSWORD` and `SEED_GATELEADER_PASSWORD` before seeding anything
> shared, and the seed uses those instead. The login page prints these hints in
> development only — on a deployed site it hides them, since that page is
> public (`SHOW_DEMO_ACCOUNTS=1` overrides that).

---

## The demo event

`npm run setup` builds a convincing operational picture immediately:

- **Al-Zawraa vs Al-Shorta** — status `LIVE`, anchored to today so the
  dashboard, timeline and check-in times are all consistent whenever you run it
- 1 venue with a stadium map, 8 gates, 6 working points
- 32-person team (28 assigned, 4 reserve), 8 gate leaders
- Assignments, attendance, 4 announcements, 3 issues, an 8-step timeline,
  15 map markers and a seeded assignment change
- Gate 3 is deliberately **3/5 understaffed** and Gate 6 is **2/3** — so the
  staffing view has something real to flag
- Plus a concert in `PLANNING` and a completed exhibition, so empty states and
  the report both have material

### Walking the demo (spec §45)

1. Sign in as `admin` → open **الزوراء × الشرطة** → 32 members, 8 gates
2. **الخريطة** — interactive stadium map, markers linked to gates
3. **البوابات** — Gate 3 reads `3 / 5 — نقص في الطاقم`
4. **التوزيع** → *توزيع عضو* → assign a reserve member to Gate 3
5. Find Amir (Gate 4) → *نقل العضو* → move him to Gate 6, give a reason
6. **سجل النشاط** — the move is recorded: `البوابة 4 → البوابة 6`
7. Open Amir's personal link — it already shows Gate 6 and the change notice
8. **الإعلانات** — publish an `عاجل` announcement; refresh Amir's page
9. **الحضور** — mark Amir present; the dashboard counters update
10. Move the event to `منتهية`, then open **التقرير**

---

## On a phone

Every screen works from 390px up. This is not a shrunk desktop:

- **Admin and leader screens** — the sidebar becomes a drawer, the five
  most-used sections move to a bottom tab bar within thumb reach, and every
  data table turns into a stack of cards where each value carries its own
  label. Nothing scrolls sideways at any width.
- **The member portal** was mobile-first from the start: location, arrival and
  task in large type, everything else below.
- **The venue map** sizes itself to the screen, drops marker labels when the
  whole stadium is scaled down (the legend and the glyphs carry the meaning),
  and brings them back as you zoom in.
- Touch targets grow on touch devices, and inputs use 16px text so iOS doesn't
  zoom when you tap a field.

### Installing it as an app

It is a PWA, so it installs from the browser on both Android and iPhone — no
store, no build, no developer account.

- **Android (Chrome):** an install card appears; or menu ⋮ → *Add to Home screen*
- **iPhone (Safari):** share → *Add to Home Screen*. Safari shows no install
  API, so the app displays those two steps itself.

Installed, it opens full-screen with its own icon, and pages you have already
opened keep working when the signal drops — useful inside a stadium. Live data
is always fetched fresh, never served stale from the cache, and nothing you
submit is silently queued.

**This requires HTTPS.** On a plain `http://192.168.x.x` address the app still
works, but cannot be installed. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for a free one-command way to get an
HTTPS address for testing on your phone today.

---

## Stack

| Layer      | Choice                                                             |
| ---------- | ------------------------------------------------------------------ |
| Framework  | Next.js 15 (App Router, Server Components, Server Actions)          |
| Language   | TypeScript, strict                                                  |
| Styling    | Tailwind CSS                                                        |
| Database   | SQLite via Drizzle ORM + libSQL — a local file, or hosted on Turso  |
| Auth       | Signed HTTP-only session cookie (jose) + bcrypt password hashes     |
| Map        | Konva / react-konva on a normalized (0–1) coordinate system         |
| Validation | zod, on the server, on every write                                  |

**Why SQLite?** The whole app runs with `npm install` and nothing else — no
account, no keys, no network. The same libSQL driver then talks to a hosted
[Turso](https://turso.tech) database in production without a line of code
changing, so the deployed site and the laptop behave identically. Moving to
PostgreSQL (Supabase included) instead is a `dialect` change and a connection
string: see [`docs/POSTGRES_MIGRATION.md`](docs/POSTGRES_MIGRATION.md).

Where to host it, free and otherwise, is covered in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Project layout

```
src/
  app/
    login/                    sign-in
    admin/(home)/             dashboard, events, venues, team, settings
    admin/(event)/events/[id] event workspace  (11 sections)
    leader/(home)/            team-leader dashboard and event list
    leader/(event)/events/[id] the same workspace, scoped to granted events
    member/[token]/           mobile member portal + member map
    api/uploads/map/          venue / event map upload
    api/setup/                first-run setup for a fresh deployment
    uploads/[name]/           serves stored map images
  components/
    shell/                    AppShell, sidebar, bottom tab bar
    ui/                       panels, badges, states, dialogs, icons
    map/                      MapStage (canvas), MapEditor (toolbox + panel)
    pwa/                      AppRuntime, install prompt, offline banner
    event/                    EventCard
    venue/                    MapUploader
  features/event/
    workspace.tsx             shared layout + guard for both mount points
    pages/                    one component per workspace section
  server/
    auth/                     session cookie, role + event-scope guards
    actions/                  server actions — every write goes through here
    services/                 queries and business rules (staffing, conflicts)
  db/
    schema.ts                 17 tables
    seed.ts                   demo data
  lib/
    constants.ts              the value lists behind every status column
    validation.ts             zod schemas
    i18n/                     ar.ts (source of truth) + en.ts
    time.ts                   "HH:mm" / "YYYY-MM-DD" helpers, overlap test

public/
  manifest.webmanifest        PWA manifest
  sw.js                       service worker (static cache, live pages)
  offline.html                shown only when a page was never opened before
  icons/                      app icons, generated by scripts/make-icons.py
  maps/                       the demo stadium map
```

The event workspace lives in `src/features/event` and is mounted twice — once
under `/admin`, once under `/leader`. Same components, same guard, different
route prefix; nothing is duplicated.

---

## Data model

Four concepts are deliberately kept apart (spec §45):

```
users          authentication + permissions
team_members   a person who works events, reusable across all of them
event_members  that person taking part in ONE event  + their secure token
assignments    that participation's gate/point + task + arrival + shift
```

Seventeen tables in total: `users`, `event_access`, `team_members`, `venues`,
`events`, `event_members`, `gates`, `working_points`, `assignments`,
`assignment_changes`, `attendance`, `announcements`, `issues`,
`timeline_items`, `map_markers`, `audit_logs`, and `uploads` for map images.

Two conventions worth knowing:

- **Times are strings.** `"HH:mm"` for clock times, `"YYYY-MM-DD"` for
  calendar days. Nothing converts through a timezone, so an arrival time set as
  16:30 reads back as 16:30 on every device.
- **Map positions are normalized.** `x` and `y` are `0..1` relative to the map
  image, so the same marker lands correctly on a 27" monitor and a 5" phone.

---

## Security model

- Every page and every server action re-checks authorization on the server.
  Route protection in the browser is convenience only.
- Non-admin users need an explicit `event_access` row to reach an event at all.
  A gate leader's row carries a `gate_id`, which narrows their team, attendance
  and issue views to that one gate.
- Member tokens are 128 bits of `crypto.randomBytes`, hex-encoded. They are not
  derived from any id, cannot be enumerated, and can be rotated or revoked from
  **Event → Team** — rotating invalidates the old link immediately.
- A member's issue report is filed against the gate on *their own assignment*,
  never against a gate id taken from the form.
- Passwords are bcrypt hashed; the login path always runs a hash comparison so
  a wrong username and a wrong password cost the same time.
- No secrets in the code. `AUTH_SECRET` and `DATABASE_URL` come from `.env`.

### Verified

`e2e-check.mjs` drives a real browser through the full demonstration scenario
and the security cases, against a production build:

```bash
npm run build && npm run start     # in one terminal
node e2e-check.mjs                 # in another
```

38 checks: the whole workflow end to end, plus — anonymous users redirected to
login, unknown and malformed tokens rejected, a team leader blocked from an
unrelated event and from `/admin`, a gate leader unable to see other gates'
members, wrong passwords rejected, assignment conflicts caught, and Arabic RTL
/ English LTR both rendering.

`pwa-check.mjs` covers the app side — manifest, icons, service worker
registration, and that a cached page still opens with the network off while an
unseen one shows the offline notice. `mobile-audit.mjs` walks every screen at
390px and fails on any horizontal overflow.

Each suite mutates data, so reset before running — and **restart the server
after a reset**. `db:reset` replaces the database file, and a server that is
already running keeps a handle on the old one, so it would answer from data
that no longer exists:

```bash
npm run db:reset && npm run build && npm run start
node e2e-check.mjs
node pwa-check.mjs
node mobile-audit.mjs
```

---

## Scripts

| Command            | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `npm run dev`      | Development server                                   |
| `npm run build`    | Production build                                     |
| `npm run start`    | Serve the production build                           |
| `npm run setup`    | Create the database and load demo data               |
| `npm run db:reset` | Wipe and rebuild the database from scratch           |
| `npm run db:seed`  | Re-seed only                                         |
| `npm run db:studio`| Drizzle Studio, to browse the data                   |
| `npm run typecheck`| `tsc --noEmit`                                       |

---

## Notes and limits

- **Map uploads** are stored in the database and served by
  `src/app/uploads/[name]/route.ts`, downscaled to at most 2400px on the way
  in. They deliberately do *not* go in `public/`: Next.js takes its inventory
  of that folder when the production server boots, so a file written there at
  runtime returns 404 until the next restart — and a serverless host has no
  writable disk at all.
- **Announcements are in-app.** Push notifications need a server key pair and
  a subscription store; the PWA groundwork for them is now in place, but they
  are still out of MVP scope.
- **Offline is read-only.** Pages you have visited stay available without a
  connection. Recording attendance or moving someone needs the network, and
  fails visibly rather than queueing silently — an assignment that looks saved
  but never arrived is worse than an error.
- **No GPS, no AI, no ticketing integration.** All Phase 2/3 per the spec; the
  schema leaves room (gate capacity, historical attendance, issue history) but
  nothing speculative is implemented.
- The `db:reset` script deletes `data/ops.db`. Don't run it against real data.

---

## Roadmap

**Phase 2** — QR check-in, push notifications, standalone gate-leader accounts,
reserve replacement flow, a live-operations dashboard, PDF/XLSX export, offline
caching for the member portal.

**Phase 3** — staffing recommendations from expected ticket volume, attendance
and gate-performance analytics, authorized ticket-platform integration. The
system recommends; the team leader decides.
