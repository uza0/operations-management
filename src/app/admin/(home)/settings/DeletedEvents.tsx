'use client';

import { useActionState } from 'react';

import type { Dictionary } from '@/lib/i18n';
import {
  openBackupAction,
  restoreDeletedEventAction,
  restoreFromBackupAction,
  type BackupState,
  type RestoreState,
} from '@/server/actions/restore';
import { Notice } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import { formatDate, formatDateTime } from '@/lib/time';

export type DeletedEventRow = {
  id: string;
  name: string;
  date: string | null;
  deletedAt: Date;
  deletedByName: string | null;
};

/** The developer's way back for a deleted event. */
export function DeletedEvents({
  t,
  locale,
  rows,
}: {
  t: Dictionary;
  locale: 'ar' | 'en';
  rows: DeletedEventRow[];
}) {
  const [state, restore] = useActionState<RestoreState, FormData>(restoreDeletedEventAction, {
    status: 'idle',
  });

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-[13px] leading-6 text-ink-400">{t.restore.trashHint}</p>
        {state.status === 'error' ? <Notice tone="crit">{state.message}</Notice> : null}
        {state.status === 'success' ? <Notice tone="ok">{state.message}</Notice> : null}
        {rows.length === 0 ? (
          <p className="text-[13px] text-ink-500">{t.restore.trashEmpty}</p>
        ) : (
          <ul className="divide-y divide-ink-800 rounded-card border border-ink-800">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink-100">{row.name}</p>
                  <p className="text-[12px] text-ink-500">
                    {row.date ? formatDate(row.date, locale) : '—'} · {t.restore.deletedAt}{' '}
                    {formatDateTime(new Date(row.deletedAt), locale)}
                    {row.deletedByName ? ` · ${row.deletedByName}` : ''}
                  </p>
                </div>
                <form action={restore}>
                  <input type="hidden" name="id" value={row.id} />
                  <SubmitButton className="btn-primary btn-sm" pendingLabel={t.restore.restoring}>
                    {t.restore.restore}
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <BackupRestore t={t} />
    </div>
  );
}

/**
 * For events deleted before the copy above existed: a copy of the whole
 * database from before the delete, made by Turso, and the events it still has.
 */
function BackupRestore({ t }: { t: Dictionary }) {
  const [opened, open] = useActionState<BackupState, FormData>(openBackupAction, { status: 'idle' });
  const [restored, restoreOne] = useActionState<BackupState, FormData>(
    async (prev: BackupState, form: FormData) =>
      restoreFromBackupAction(prev.status === 'ready' ? prev : opened, form),
    { status: 'idle' },
  );
  const current = restored.status === 'ready' ? restored : opened;

  return (
    <div className="space-y-3 border-t border-ink-800 pt-4">
      <p className="text-[14px] font-semibold text-ink-100">{t.restore.backupTitle}</p>
      <p className="text-[13px] leading-6 text-ink-400">{t.restore.backupHint}</p>

      <form action={open} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="apiToken">
            {t.restore.apiToken}
          </label>
          <input id="apiToken" name="apiToken" type="password" className="field" dir="ltr" autoComplete="off" required />
        </div>
        <div>
          <label className="field-label" htmlFor="at">
            {t.restore.at}
          </label>
          <input id="at" name="at" type="datetime-local" className="field" dir="ltr" required />
        </div>
        <div className="sm:col-span-3">
          <SubmitButton className="btn-secondary btn-sm" pendingLabel={t.restore.opening}>
            {t.restore.open}
          </SubmitButton>
        </div>
      </form>

      {opened.status === 'error' ? <Notice tone="crit">{opened.message}</Notice> : null}

      {current.status === 'ready' ? (
        <div className="space-y-2">
          <p className="text-[12px] text-ink-500" dir="ltr">
            {current.copyName}
          </p>
          {current.message ? <Notice tone="info">{current.message}</Notice> : null}
          {current.missing.length === 0 ? (
            <p className="text-[13px] text-ink-500">{t.restore.nothingMissing}</p>
          ) : (
            <ul className="divide-y divide-ink-800 rounded-card border border-ink-800">
              {current.missing.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-100">{event.name}</p>
                    <p className="nums text-[12px] text-ink-500">{event.date}</p>
                  </div>
                  <form action={restoreOne}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <SubmitButton className="btn-primary btn-sm" pendingLabel={t.restore.restoring}>
                      {t.restore.restore}
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[12px] text-ink-500">{t.restore.cleanup}</p>
        </div>
      ) : null}
    </div>
  );
}
