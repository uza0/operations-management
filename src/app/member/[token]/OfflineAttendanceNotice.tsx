'use client';

import { Notice } from '@/components/ui/states';
import type { Dictionary } from '@/lib/i18n';
import { format } from '@/lib/i18n';
import type { QueuedAttendanceAction } from '@/lib/attendance-outbox';
import { useOfflineAttendance } from './useOfflineAttendance';

export function OfflineAttendanceNotice({
  t,
  action,
  busy,
  onRetry,
}: {
  t: Dictionary;
  action: QueuedAttendanceAction | null;
  busy: boolean;
  onRetry: () => void;
}) {
  if (!action) return null;
  return (
    <Notice tone={action.blocked ? 'warn' : 'info'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {action.blocked ? t.pwa.attendanceSyncBlocked : t.member.offlineSaved}
        </span>
        {action.blocked ? (
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={busy}
            onClick={onRetry}
          >
            {busy ? t.common.saving : t.pwa.retrySync}
          </button>
        ) : null}
      </div>
    </Notice>
  );
}

export function PendingAttendanceSync({
  t,
  token,
}: {
  t: Dictionary;
  token: string;
}) {
  const offline = useOfflineAttendance(token, t);
  if (offline.queued.length === 0) return null;
  const blocked = offline.queued.some((action) => action.blocked);

  return (
    <Notice tone={blocked ? 'warn' : 'info'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {format(t.member.pendingSend, { n: offline.queued.length })} ·{' '}
          {blocked ? t.pwa.attendanceSyncBlocked : t.member.offlineSaved}
        </span>
        {blocked ? (
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={offline.busy}
            onClick={() => void offline.retry()}
          >
            {offline.busy ? t.common.saving : t.pwa.retrySync}
          </button>
        ) : null}
      </div>
    </Notice>
  );
}
