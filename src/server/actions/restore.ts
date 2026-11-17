'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';

import { db, rawClient } from '@/db';
import { deletedEvents, events } from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { currentUser } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';
import { collectEventTree, restoreEventTree, type EventTree } from '@/server/services/event-tree';
import { createPointInTimeCopy } from '@/server/services/turso-restore';

/**
 * Putting a deleted event back. The system's developer only: a restore writes
 * dozens of rows into the live database at once, and the person who can undo
 * a wrong one is the person who should be allowed to do it.
 */
async function developer() {
  const user = await currentUser();
  if (!user || user.role !== 'ADMIN' || !user.systemDeveloper) return null;
  return user;
}

export type RestoreState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success'; message: string };

const done = (message: string): RestoreState => ({ status: 'success', message });
const failed = (message: string): RestoreState => ({ status: 'error', message });

function refresh() {
  revalidatePath('/admin/settings');
  revalidatePath('/admin/events');
  revalidatePath('/admin');
}

/** The copy kept at deletion goes back into the live database. */
export async function restoreDeletedEventAction(
  _prev: RestoreState,
  form: FormData,
): Promise<RestoreState> {
  const { t } = await getT();
  const user = await developer();
  if (!user) return failed(t.errors.forbidden);

  const row = await db.query.deletedEvents.findFirst({
    where: eq(deletedEvents.id, String(form.get('id') ?? '')),
  });
  if (!row) return failed(t.errors.notFound);

  const live = await db.query.events.findFirst({ where: eq(events.id, row.eventId) });
  if (live) return failed(t.restore.alreadyThere);

  try {
    const tree = JSON.parse(row.payload) as EventTree;
    await restoreEventTree(rawClient(), tree);
  } catch (error) {
    return failed(`${t.restore.failed}: ${error instanceof Error ? error.message : String(error)}`);
  }

  await db.delete(deletedEvents).where(eq(deletedEvents.id, row.id));
  await recordAudit({
    eventId: row.eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'CREATE',
    entity: 'EVENT',
    entityId: row.eventId,
    entityLabel: row.name,
    summary: `${t.restore.restoredSummary}: ${row.name}`,
  });
  refresh();
  return done(`${t.restore.restored}: ${row.name}`);
}

export type BackupEvent = { id: string; name: string; date: string; status: string };

export type BackupState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      /** Where the copy lives — sent back with the restore request. */
      url: string;
      authToken: string;
      copyName: string;
      missing: BackupEvent[];
      message?: string;
    };

const HOSTED = /^libsql:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.turso\.io$/;

/**
 * Step one for events deleted before the copy above existed: make a copy of
 * the database as it was at the chosen moment, and list the events it has
 * that the live one does not.
 */
export async function openBackupAction(_prev: BackupState, form: FormData): Promise<BackupState> {
  const { t } = await getT();
  if (!(await developer())) return { status: 'error', message: t.errors.forbidden };

  let url = String(form.get('url') ?? '');
  let authToken = String(form.get('authToken') ?? '');
  let copyName = String(form.get('copyName') ?? '');

  if (!url) {
    const apiToken = String(form.get('apiToken') ?? '').trim();
    const local = String(form.get('at') ?? ''); // yyyy-mm-ddThh:mm, Baghdad time
    const liveUrl = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
    if (!apiToken || !local) return { status: 'error', message: t.errors.required };
    if (!HOSTED.test(liveUrl)) return { status: 'error', message: t.restore.notHosted };
    const at = new Date(`${local}:00+03:00`);
    if (Number.isNaN(at.getTime())) return { status: 'error', message: t.errors.invalidDate };
    try {
      const copy = await createPointInTimeCopy(apiToken, liveUrl, at);
      ({ url, authToken } = copy);
      copyName = copy.name;
    } catch (error) {
      return { status: 'error', message: `${t.restore.failed}: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  if (!HOSTED.test(url) && !(process.env.NODE_ENV !== 'production' && url.startsWith('file:'))) {
    return { status: 'error', message: t.restore.notHosted };
  }

  // A fresh copy can take a few seconds before it answers.
  const backup = createClient({ url, authToken: authToken || undefined });
  let rows: BackupEvent[] = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const result = await backup.execute('select id, name, date, status from events');
      rows = result.rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        date: String(r.date),
        status: String(r.status),
      }));
      break;
    } catch (error) {
      if (attempt === 5) {
        backup.close();
        return { status: 'error', message: `${t.restore.failed}: ${error instanceof Error ? error.message : String(error)}` };
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  backup.close();

  const liveIds = new Set((await db.select({ id: events.id }).from(events)).map((r) => r.id));
  const missing = rows.filter((r) => !liveIds.has(r.id)).sort((a, b) => b.date.localeCompare(a.date));
  return { status: 'ready', url, authToken, copyName, missing };
}

/** Step two: one event from that copy goes back into the live database. */
export async function restoreFromBackupAction(
  prev: BackupState,
  form: FormData,
): Promise<BackupState> {
  const { t } = await getT();
  const user = await developer();
  if (!user) return { status: 'error', message: t.errors.forbidden };
  if (prev.status !== 'ready') return prev;

  const eventId = String(form.get('eventId') ?? '');
  const backup = createClient({ url: prev.url, authToken: prev.authToken || undefined });
  try {
    const tree = await collectEventTree(backup, eventId);
    if (!tree) return { ...prev, message: t.errors.notFound };
    await restoreEventTree(rawClient(), tree);
  } catch (error) {
    return { ...prev, message: `${t.restore.failed}: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    backup.close();
  }

  const name = prev.missing.find((e) => e.id === eventId)?.name ?? eventId;
  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'CREATE',
    entity: 'EVENT',
    entityId: eventId,
    entityLabel: name,
    summary: `${t.restore.restoredSummary}: ${name}`,
  });
  refresh();
  return {
    ...prev,
    missing: prev.missing.filter((e) => e.id !== eventId),
    message: `${t.restore.restored}: ${name}`,
  };
}
