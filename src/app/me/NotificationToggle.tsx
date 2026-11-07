'use client';

import { useActionState, useEffect, useState } from 'react';

import { subscribeToPushAction, unsubscribeFromPushAction } from '@/server/actions/push';
import { idle } from '@/server/actions/types';
import { FormError, Notice } from '@/components/ui/states';
import type { Dictionary } from '@/lib/i18n';

/**
 * Turning the phone's own notifications on, from his page.
 *
 * Everything here happens on the device: the browser asks him, the browser
 * makes the keys, and only the result is sent to us. So the state has to be
 * read from the device too rather than from the server — a subscription he
 * revoked in his browser settings is gone whatever our table still says, and
 * a button that insists otherwise is a button nobody believes again.
 *
 * The iPhone is the reason for half of this. Safari refuses a subscription on
 * a page that is merely open; the app has to be installed and opened from the
 * icon. It does not say so — it just denies — so the case is detected and
 * explained before he presses anything.
 */
export function NotificationToggle({
  t,
  publicKey,
}: {
  t: Dictionary;
  /** Empty when the server has no keys, in which case there is nothing to offer. */
  publicKey: string;
}) {
  const [state, subscribe] = useActionState(subscribeToPushAction, idle);
  const [offState, unsubscribe] = useActionState(unsubscribeFromPushAction, idle);
  const [on, setOn] = useState<boolean | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  /*
   * iOS gives a page no PushManager at all until the app is installed, so the
   * absence of it on an iPhone means "install me first", not "no support".
   */
  const iosNotInstalled =
    typeof window !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !window.matchMedia('(display-mode: standalone)').matches &&
    !(window.navigator as unknown as { standalone?: boolean }).standalone;

  useEffect(() => {
    if (!supported) {
      setOn(false);
      return;
    }
    let alive = true;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (alive) setOn(Boolean(sub) && Notification.permission === 'granted');
      })
      .catch(() => {
        if (alive) setOn(false);
      });
    return () => {
      alive = false;
    };
  }, [supported, state, offState]);

  /** base64url, which is what the browser wants the key as. */
  function toBytes(key: string) {
    const padded = (key + '='.repeat((4 - (key.length % 4)) % 4))
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const raw = atob(padded);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  async function turnOn() {
    setProblem(null);
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setProblem(t.push.denied);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toBytes(publicKey),
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: Record<string, string> };

      const form = new FormData();
      form.set('endpoint', json.endpoint ?? '');
      form.set('p256dh', json.keys?.p256dh ?? '');
      form.set('auth', json.keys?.auth ?? '');
      form.set('deviceLabel', navigator.userAgent.slice(0, 80));
      subscribe(form);
    } catch {
      setProblem(t.push.failed);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      const endpoint = sub?.endpoint ?? '';
      await sub?.unsubscribe();
      const form = new FormData();
      form.set('endpoint', endpoint);
      unsubscribe(form);
      setOn(false);
    } catch {
      setProblem(t.push.failed);
    } finally {
      setBusy(false);
    }
  }

  if (!publicKey) return null;

  return (
    <section className="rounded-card border border-ink-700 bg-ink-850 p-4">
      <p className="text-[12.5px] font-semibold uppercase tracking-wide text-ink-500">
        {t.push.title}
      </p>
      <p className="mt-1.5 text-[13px] leading-6 text-ink-300">{t.push.hint}</p>

      <div className="mt-3">
        {iosNotInstalled ? (
          <Notice tone="info">{t.push.needsInstall}</Notice>
        ) : !supported ? (
          <Notice tone="info">{t.push.unsupported}</Notice>
        ) : on ? (
          <>
            <Notice tone="ok">{t.push.on}</Notice>
            <button
              type="button"
              className="btn-ghost btn-sm mt-2 w-full"
              disabled={busy}
              onClick={turnOff}
            >
              {t.push.disable}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn-primary btn-sm w-full"
            disabled={busy || on === null}
            onClick={turnOn}
          >
            {busy ? t.push.enabling : t.push.enable}
          </button>
        )}
      </div>

      {problem ? <FormError message={problem} /> : null}
      {state.status === 'error' ? <FormError message={state.message} /> : null}
    </section>
  );
}
