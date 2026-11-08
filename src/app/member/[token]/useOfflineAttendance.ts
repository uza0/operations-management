'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  reportArrivalAction,
  reportDepartureAction,
  reportSeatArrivalAction,
  reportSeatDepartureAction,
} from '@/server/actions/journey';
import { idle } from '@/server/actions/types';
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

    const action =
      item.kind === 'EVENT_ARRIVAL'
        ? reportArrivalAction
        : item.kind === 'EVENT_DEPARTURE'
          ? reportDepartureAction
          : item.kind === 'SEAT_ARRIVAL'
            ? reportSeatArrivalAction
            : reportSeatDepartureAction;
    const result = await action(idle, body);
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
    const onOnline = () => void drain();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [drain, refreshQueue]);

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
