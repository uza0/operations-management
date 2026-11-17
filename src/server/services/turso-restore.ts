import 'server-only';

/**
 * Making a copy of the live database as it was at an earlier moment.
 *
 * Turso keeps the history itself (24 hours on the free plan, 30 days on paid
 * ones) and can create a NEW database from any point in it; the live one is
 * never touched. Doing that by hand needs the Turso CLI on a computer. Here it
 * needs only a Turso API token, pasted once on the settings page, so an event
 * deleted by mistake can be recovered from a phone.
 *
 * The token is used for this request and never stored.
 */

const API = 'https://api.turso.tech/v1';

type Database = { Name: string; Hostname: string; group?: string };

async function call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !body) {
    throw new Error(body?.error ?? `Turso API: HTTP ${response.status}`);
  }
  return body;
}

/** Finds the live database among the token's organisations by its hostname. */
async function findLive(token: string, liveHost: string) {
  const orgs = await call<{ slug: string }[]>(token, '/organizations');
  for (const org of orgs) {
    const { databases } = await call<{ databases: Database[] }>(
      token,
      `/organizations/${org.slug}/databases`,
    );
    const match = databases.find((db) => db.Hostname === liveHost);
    if (match) return { org: org.slug, db: match };
  }
  throw new Error('The live database was not found with this token.');
}

/**
 * Creates `<live>-restore-<time>` from the live database at `at`, and returns
 * how to connect to it.
 */
export async function createPointInTimeCopy(token: string, liveUrl: string, at: Date) {
  const liveHost = new URL(liveUrl.replace(/^libsql:/, 'https:')).hostname;
  const { org, db } = await findLive(token, liveHost);

  const stamp = at.toISOString().replace(/[-:]/g, '').slice(0, 13).toLowerCase();
  const suffix = Math.random().toString(36).slice(2, 6);
  const name = `${db.Name}-restore-${stamp}-${suffix}`.slice(0, 63);

  const created = await call<{ database: Database }>(token, `/organizations/${org}/databases`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      group: db.group ?? 'default',
      seed: { type: 'database', name: db.Name, timestamp: at.toISOString().replace(/\.\d{3}Z$/, 'Z') },
    }),
  });

  const { jwt } = await call<{ jwt: string }>(
    token,
    `/organizations/${org}/databases/${created.database.Name}/auth/tokens?authorization=read-only&expiration=1d`,
    { method: 'POST' },
  );

  return { name: created.database.Name, url: `libsql://${created.database.Hostname}`, authToken: jwt };
}
