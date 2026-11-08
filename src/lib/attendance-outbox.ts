'use client';

/**
 * Small, local queue for a promoter's own arrival and departure reports.
 * The server actions are idempotent, so an interrupted response can safely be
 * retried without creating duplicate attendance records.
 */

export type AttendanceActionKind =
  | 'EVENT_ARRIVAL'
  | 'EVENT_DEPARTURE'
  | 'SEAT_ARRIVAL'
  | 'SEAT_DEPARTURE';

export type QueuedAttendanceAction = {
  clientId: string;
  token: string;
  kind: AttendanceActionKind;
  seatMemberId?: string;
  capturedAt: string;
  /** Use only after an offline capture or a failed first delivery. */
  preferCapturedAt: boolean;
  createdAt: number;
  attempts: number;
  blocked?: boolean;
  lastError?: string;
};

const DB_NAME = 'ops-attendance-outbox';
const STORE = 'attendance';
const VERSION = 1;
let flushInProgress: Promise<{ sent: number; left: number }> | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'clientId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function request<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  } catch {
    return null;
  }
}

export function newAttendanceActionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export async function enqueueAttendanceAction(
  action: QueuedAttendanceAction,
): Promise<boolean> {
  return (await request('readwrite', (store) => store.put(action))) !== null;
}

export async function listAttendanceActions(): Promise<QueuedAttendanceAction[]> {
  return (await request<QueuedAttendanceAction[]>('readonly', (store) => store.getAll())) ?? [];
}

export async function removeAttendanceAction(clientId: string): Promise<void> {
  await request('readwrite', (store) => store.delete(clientId));
}

async function updateAttendanceAction(action: QueuedAttendanceAction): Promise<void> {
  await request('readwrite', (store) => store.put(action));
}

export async function flushAttendanceActions(
  send: (action: QueuedAttendanceAction) => Promise<{
    ok: boolean;
    message?: string;
    retryable?: boolean;
  }>,
  retryBlocked = false,
): Promise<{ sent: number; left: number }> {
  if (flushInProgress) return flushInProgress;

  flushInProgress = (async () => {
    const queued = (await listAttendanceActions()).sort(
      (a, b) =>
        a.createdAt - b.createdAt ||
        (a.kind.includes('ARRIVAL') ? 0 : 1) - (b.kind.includes('ARRIVAL') ? 0 : 1),
    );
    let sent = 0;

    for (const action of queued) {
      if (action.blocked && !retryBlocked) break;
      try {
        const result = await send(action);
        if (result.ok) {
          await removeAttendanceAction(action.clientId);
          sent += 1;
          continue;
        }
        await updateAttendanceAction({
          ...action,
          attempts: action.attempts + 1,
          blocked: result.retryable === false,
          preferCapturedAt: true,
          lastError: result.message,
        });
        // Keep later actions in order (arrival before departure).
        break;
      } catch (error) {
        await updateAttendanceAction({
          ...action,
          attempts: action.attempts + 1,
          preferCapturedAt: true,
          lastError: error instanceof Error ? error.message : 'offline',
        });
        break;
      }
    }

    return { sent, left: (await listAttendanceActions()).length };
  })();

  try {
    return await flushInProgress;
  } finally {
    flushInProgress = null;
  }
}
