# Deployment

Two ways to put this online. The first is the one to use for a demo link you
send to someone else; the second is for showing it from your own laptop, now,
with nothing to set up.

---

## A. Vercel + Turso — a permanent link, free

The app runs on Vercel and keeps its data in Turso, a hosted SQLite. Both have
a free tier that needs no credit card. Nothing in the code changes between your
laptop and the deployed site: the same libSQL driver talks to a local file
(`file:./data/ops.db`) or to a hosted database (`libsql://…`), chosen by an
environment variable.

Total time: about fifteen minutes.

### 1. Create the database

1. Go to **https://turso.tech** and sign up (GitHub sign-in is fastest).
2. Create a database — any name, e.g. `ops`. Pick the region closest to you.
3. From the database page copy two things:
   - the **URL**, which looks like `libsql://ops-yourname.turso.io`
   - a **token** (Create Token / Generate Token) — a long `ey…` string

The token is a password. Keep it out of the repository; it goes in `.env` and
in Vercel's environment settings, both of which stay private.

### 2. Fill the cloud database from your laptop

Add the two values to your local `.env`:

```env
TURSO_DATABASE_URL="libsql://ops-yourname.turso.io"
TURSO_AUTH_TOKEN="ey..."
```

Then, once:

```bash
npm run db:push -- --force    # creates the 16 tables in the cloud database
npm run db:seed               # loads the demo event
```

Both commands use `TURSO_DATABASE_URL` when it is set, so they act on the
hosted database, not the local file.

> When you want to go back to working locally, comment those two lines out of
> `.env` again. The local file is untouched either way.

### 3. Deploy

From the project folder:

```bash
npx vercel login
npx vercel            # first run: answer the questions, accept the defaults
npx vercel --prod
```

Then give the deployment its environment variables — in the Vercel dashboard
under **Settings → Environment Variables**, or from the terminal:

```bash
npx vercel env add AUTH_SECRET production
npx vercel env add TURSO_DATABASE_URL production
npx vercel env add TURSO_AUTH_TOKEN production
```

`AUTH_SECRET` signs the session cookie. Generate a fresh one — never reuse the
local one:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Redeploy once after adding them so the running site picks them up:

```bash
npx vercel --prod
```

You now have a link like `https://operations-management.vercel.app`.

### 4. Before you send the link

- **Change the demo passwords.** The seeded accounts are published in the
  README. Set `SEED_ADMIN_PASSWORD`, `SEED_LEADER_PASSWORD` and
  `SEED_GATELEADER_PASSWORD` in `.env`, re-run `npm run db:seed`, and tell the
  people you invite what the new ones are.
- **`NEXT_PUBLIC_APP_URL` can stay unset.** Member links are built from the
  request's own host, so they come out right on whatever domain is serving
  them.
- **A custom domain** is free on Vercel: Settings → Domains → add it, then
  point the DNS record it shows you. HTTPS is issued automatically.

### What to know before relying on it

- **Vercel's free Hobby plan is licensed for personal, non-commercial use.**
  Showing your own project to a company is one thing; the day the company
  actually runs its events on it, that is commercial use and it belongs on
  Vercel Pro (about $20/month), a small VPS (about $5/month), or the company's
  own server. Worth saying out loud in the meeting — it reads as competence,
  not as a problem.
- **Uploaded map images are stored in the database**, not on disk, because
  Vercel's filesystem is read-only. They are downscaled to at most 2400px and
  under ~900 KB on the way in. Turso's free tier holds 5 GB, so this is not a
  practical limit.
- **Free-tier limits** are generous for a demo: 100 GB of traffic a month on
  Vercel, 500 million row reads on Turso. A demo will not come close.

---

## B. A link straight from your laptop — instant, nothing to set up

Useful for showing someone something today, or for testing on your phone
before the app is deployed anywhere.

```bash
npm run build && npm run start          # in one terminal
cloudflared tunnel --url http://localhost:3000   # in another
```

`cloudflared` prints an `https://something.trycloudflare.com` address that
works from anywhere. Install it once from
https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/.

The catch is that your laptop is the server: it must stay awake and connected
the whole time they are looking, and the address changes every time you restart
the tunnel.

This is also the way to **install the app on a phone before deploying** — a PWA
can only be installed over HTTPS, so a plain `http://192.168.x.x` address will
open the app but will not offer to install it.

---

## Other hosts

The app is a standard Next.js server with one SQLite connection, so anything
that runs Node will run it.

| Host | Free? | Watch out for |
| --- | --- | --- |
| **Vercel + Turso** | Yes | Non-commercial licence on the free plan |
| **Render** free tier | Yes | Sleeps after 15 minutes; the next visitor waits about a minute. No persistent disk, so use Turso for the database here too |
| **A small VPS** (Hetzner, Contabo) | ~$5/month | You manage Node, a reverse proxy and TLS yourself — but SQLite can live on the disk and nothing is metered |
| **Fly.io** | No longer | Free tier ended; roughly $5/month for the smallest always-on machine |

On any host with a real writable disk you can drop Turso entirely and keep
`DATABASE_URL="file:./data/ops.db"` — just make sure that file is on a volume
that survives a restart.
