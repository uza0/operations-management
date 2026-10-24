'use client';

/**
 * Reports that survive a dead network.
 *
 * Inside a full stadium there is no signal. That is not an edge case here —
 * it is the normal condition of the one screen this system exists to be used
 * on, at the one hour it matters. Until now a promoter who tapped "report a
 * problem" with no bars watched the request fail: the service worker caches
 * pages, but it deliberately leaves every write alone, and a server action is
 * a write.
 *
 * So a report is written to the phone FIRST and sent afterwards:
 *
 *   1. the device mints an id and stores the report in IndexedDB
 *   2. the screen says, truthfully, "saved on your phone"
 *   3. a send is attempted; if it fails the report stays queued
 *   4. the queue drains when the network returns, or on the next page load
 *
 * The id is what makes step 4 safe to repeat: the server recognises a report
 * it has already taken and answers success without creating a second one. See
 * `clientId` on the issues table.
 *
 * IndexedDB rather than localStorage because this must survive the tab being
 * killed by a phone short on memory, which is the other thing stadiums do.
 */

const DB_NAME = 'ops-outbox';
const STORE = 'queued';
const VERSION = 1;

export type QueuedReport = {
  clientId: string;
  token: string;
  type: string;
  priority: string;
  description: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'clientId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Every call here is wrapped, because storage is not guaranteed: a private
 * window, a browser with site data blocked, or a phone that has simply run out
 * all throw. A queue that cannot be written to must not take the report down
 * with it — the caller falls back to sending straight to the server, which is
 * exactly what used to happen and is no worse than before.
 */
async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

export function newClientId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export async function enqueue(report: QueuedReport): Promise<boolean> {
  const saved = await withStore('readwrite', (store) => store.put(report));
  return saved !== null;
}

export async function listQueued(): Promise<QueuedReport[]> {
  const rows = await withStore<QueuedReport[]>('readonly', (store) => store.getAll());
  return rows ?? [];
}

export async function dequeue(clientId: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(clientId));
}

export async function markAttempt(report: QueuedReport, error: string): Promise<void> {
  await withStore('readwrite', (store) =>
    store.put({ ...report, attempts: report.attempts + 1, lastError: error }),
  );
}

/**
 * Send everything that is waiting.
 *
 * `send` is passed in rather than imported so that this file stays free of the
 * server action and can be reasoned about — and tested — as plain storage.
 * A report is dropped from the queue only when the server has actually taken
 * it; anything else leaves it queued for the next attempt, which is the whole
 * point. After a stubborn number of failures it stays, but stops being retried
 * automatically, so a malformed report cannot spin forever on a phone battery.
 */
export const MAX_ATTEMPTS = 8;

export async function flush(
  send: (report: QueuedReport) => Promise<{ ok: boolean; message?: string }>,
): Promise<{ sent: number; left: number }> {
  const queued = await listQueued();
  let sent = 0;

  for (const report of queued) {
    if (report.attempts >= MAX_ATTEMPTS) continue;
    try {
      const result = await send(report);
      if (result.ok) {
        await dequeue(report.clientId);
        sent += 1;
      } else {
        await markAttempt(report, result.message ?? 'failed');
      }
    } catch (error) {
      await markAttempt(report, error instanceof Error ? error.message : 'offline');
    }
  }

  const left = (await listQueued()).length;
  return { sent, left };
}
