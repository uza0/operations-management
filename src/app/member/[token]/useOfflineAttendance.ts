'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { Dictionary } from '@/lib/i18n';
import {
  enqueueAttendanceAction,
  flushAttendanceActions,
  listAttendanceActions,
  newAttendanceActionId,
  type AttendanceActionKind,
  type QueuedAttendanceAction,
} from '@/lib/attendance-outbox';

export function useOfflineAttendance(token: string, t: Dictionary) {
  const router = useRouter();
  const [queued, setQueued] = useState<QueuedAttendanceAction[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshQueue = useCallback(async () => {
    const all = await listAttendanceActions();
    setQueued(all.filter((action) => action.token === token));
  }, [token]);

  const send = useCallback(async (item: QueuedAttendanceAction) => {
    const body = new FormData();
    body.set('token', item.token);
    if (item.preferCapturedAt) body.set('clientCapturedAt', item.capturedAt);
    if (item.seatMemberId) body.set('seatMemberId', item.seatMemberId);
    body.set('kind', item.kind);

    /*
     * A plain address rather than the server action: an action's id changes
     * with every deploy, and a page saved for offline use keeps the old one
     * (see app/api/member/attendance). And a deadline, because one request
     * started on a dying signal can hang for minutes and hold the whole queue
     * behind it.
     */
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    let result: { status: string; message?: string };
    try {
      const response = await fetch('/api/member/attendance', {
        method: 'POST',
        body,
        signal: controller.signal,
        cache: 'no-store',
      });
      // No JSON means the network or the server failed, not the request:
      // throwing keeps it queued for the next try instead of blocking it.
      result = await response.json();
      if (response.status >= 500) throw new Error(`HTTP ${response.status}`);
    } finally {
      window.clearTimeout(timer);
    }
    return {
      ok: result.status === 'success',
      message: result.status === 'error' ? result.message : undefined,
      retryable: false,
    };
  }, []);

  const drain = useCallback(
    async (retryBlocked = false) => {
      if (!navigator.onLine) return;
      const result = await flushAttendanceActions(send, retryBlocked);
      await refreshQueue();
      if (result.sent > 0) router.refresh();
    },
    [refreshQueue, router, send],
  );

  useEffect(() => {
    void refreshQueue();
    void drain();
    /*
     * Every chance to send. "online" alone is not enough: an iPhone often
     * never fires it, and a phone put back in a pocket and taken out again
     * comes back through visibility, not through the network event.
     */
    const onWake = () => {
      if (document.visibilityState === 'visible') void drain();
    };
    window.addEventListener('online', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('pageshow', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      window.removeEventListener('online', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('pageshow', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [drain, refreshQueue]);

  /* While something is waiting, keep trying quietly every twenty seconds. */
  const waiting = queued.some((action) => !action.blocked);
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => void drain(), 20_000);
    return () => window.clearInterval(id);
  }, [waiting, drain]);

  const record = useCallback(
    async (kind: AttendanceActionKind, seatMemberId?: string) => {
      setBusy(true);
      setError(null);
      const duplicate = (await listAttendanceActions()).some(
        (item) =>
          item.token === token &&
          item.kind === kind &&
          item.seatMemberId === seatMemberId,
      );
      if (!duplicate) {
        const item: QueuedAttendanceAction = {
          clientId: newAttendanceActionId(),
          token,
          kind,
          ...(seatMemberId ? { seatMemberId } : {}),
          capturedAt: new Date().toISOString(),
          preferCapturedAt: !navigator.onLine,
          createdAt: Date.now(),
          attempts: 0,
        };
        const stored = await enqueueAttendanceAction(item);
        if (!stored) {
          if (!navigator.onLine) {
            setError(t.errors.generic);
            setBusy(false);
            return;
          }
          try {
            const result = await send(item);
            if (!result.ok) {
              setError(result.message ?? t.errors.generic);
              setBusy(false);
              return;
            }
            router.refresh();
            setBusy(false);
            return;
          } catch {
            setError(t.errors.generic);
            setBusy(false);
            return;
          }
        }
      }
      await refreshQueue();
      setBusy(false);
      if (navigator.onLine) await drain();
    },
    [drain, refreshQueue, router, send, t.errors.generic, token],
  );

  const retry = useCallback(async () => {
    setError(null);
    setBusy(true);
    await drain(true);
    setBusy(false);
  }, [drain]);

  const pendingFor = useCallback(
    (kind: AttendanceActionKind, seatMemberId?: string) =>
      queued.find(
        (item) =>
          item.kind === kind && item.seatMemberId === seatMemberId,
      ) ?? null,
    [queued],
  );

  return useMemo(
    () => ({ queued, busy, error, record, retry, pendingFor }),
    [queued, busy, error, record, retry, pendingFor],
  );
}
