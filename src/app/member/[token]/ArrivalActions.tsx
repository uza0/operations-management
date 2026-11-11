'use client';

import { useEffect, useState } from 'react';

import { useOfflineAttendance } from './useOfflineAttendance';
import { OfflineAttendanceNotice } from './OfflineAttendanceNotice';
import { FormError } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/client';
import type { Dictionary } from '@/lib/i18n';

/**
 * "I'm here" and "I'm off" — one button, whichever belongs to the moment.
 *
 * Both are checked again on the server. The button that is not on the screen
 * is a courtesy; the refusal behind it is the rule.
 */
export function ArrivalButton({
  t,
  token,
  availableAt,
}: {
  t: Dictionary;
  token: string;
  /** Lets a cached confirmed page reveal arrival when its window opens offline. */
  availableAt?: number;
}) {
  const offline = useOfflineAttendance(token, t);
  const pending = offline.pendingFor('EVENT_ARRIVAL');
  const [available, setAvailable] = useState(availableAt === undefined);

  useEffect(() => {
    if (availableAt === undefined) {
      setAvailable(true);
      return;
    }
    const update = () => setAvailable(Date.now() >= availableAt);
    update();
    const delay = availableAt - Date.now();
    if (delay <= 0) return;
    const timer = window.setTimeout(update, delay);
    return () => window.clearTimeout(timer);
  }, [availableAt]);

  if (!available) return null;

  return (
    <div className="rise space-y-2">
      {pending ? (
        <OfflineAttendanceNotice
          t={t}
          action={pending}
          busy={offline.busy}
          onRetry={() => void offline.retry()}
        />
      ) : (
        <button
          type="button"
          className="btn-primary w-full py-3 text-[16px]"
          disabled={offline.busy}
          onClick={() => void offline.record('EVENT_ARRIVAL')}
        >
          {offline.busy ? t.common.saving : t.journey.arrived}
        </button>
      )}
      <p className="text-center text-[12.5px] text-ink-500">{t.journey.arrivedHint}</p>
      <FormError message={offline.error} />
    </div>
  );
}

export function DepartureButton({
  t,
  token,
  offlineOnly = false,
}: {
  t: Dictionary;
  token: string;
  offlineOnly?: boolean;
}) {
  const offline = useOfflineAttendance(token, t);
  const [online, setOnline] = useState(true);
  const [ask, confirmDialog] = useConfirm();
  const pending = offline.pendingFor('EVENT_DEPARTURE');

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (offlineOnly && online) return null;
  const submit = async () => {
    if (await ask(t.journey.departHint)) void offline.record('EVENT_DEPARTURE');
  };

  return (
    <div className="space-y-2">
      {confirmDialog}
      {pending ? (
        <OfflineAttendanceNotice
          t={t}
          action={pending}
          busy={offline.busy}
          onRetry={() => void offline.retry()}
        />
      ) : (
        <button
          type="button"
          className="btn-outline w-full"
          disabled={offline.busy}
          onClick={() => void submit()}
        >
          {offline.busy ? t.common.saving : t.journey.depart}
        </button>
      )}
      {offlineOnly ? (
        <p className="text-center text-[12px] leading-5 text-ink-500">
          {t.pwa.offlineDepartureHint}
        </p>
      ) : null}
      <FormError message={offline.error} />
    </div>
  );
}
