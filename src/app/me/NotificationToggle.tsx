'use client';

import { useActionState, useEffect, useState } from 'react';
import { subscribeToPushAction, unsubscribeFromPushAction } from '@/server/actions/push';
import { idle } from '@/server/actions/types';
import { IconBell, IconBellOff } from '@/components/ui/icons';
import { FormError, Notice } from '@/components/ui/states';
import type { Dictionary } from '@/lib/i18n';

/** Compact promoter-header control. The browser remains the source of truth for device state. */
export function NotificationToggle({ t, publicKey }: { t: Dictionary; publicKey: string }) {
  const [state, subscribe, subscribing] = useActionState(subscribeToPushAction, idle);
  const [offState, unsubscribe, unsubscribing] = useActionState(unsubscribeFromPushAction, idle);
  const [on, setOn] = useState<boolean | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const iosNotInstalled = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches && !(window.navigator as unknown as { standalone?: boolean }).standalone;
  const actionPending = subscribing || unsubscribing;

  useEffect(() => {
    if (!supported) {
      setOn(false);
      return;
    }
    let alive = true;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (alive) setOn(Boolean(subscription) && Notification.permission === 'granted');
      })
      .catch(() => {
        if (alive) setOn(false);
      });
    return () => { alive = false; };
  }, [supported, state, offState]);

  useEffect(() => {
    if (state.status === 'success') {
      setOn(true);
      setOpen(false);
      setProblem(null);
    } else if (state.status === 'error') {
      setProblem(state.message);
      setOpen(true);
    }
  }, [state]);

  useEffect(() => {
    if (offState.status === 'success') {
      setOn(false);
      setOpen(false);
      setProblem(null);
    } else if (offState.status === 'error') {
      setProblem(offState.message);
      setOpen(true);
    }
  }, [offState]);

  function toBytes(key: string) {
    const padded = (key + '='.repeat((4 - (key.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(padded);
    return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
  }

  async function turnOn() {
    setProblem(null);
    if (iosNotInstalled) {
      setProblem(t.push.needsInstall);
      setOpen(true);
      return;
    }
    if (!supported) {
      setProblem(t.push.unsupported);
      setOpen(true);
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setProblem(t.push.denied);
        setOpen(true);
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(publicKey) });
      const json = subscription.toJSON() as { endpoint?: string; keys?: Record<string, string> };
      const form = new FormData();
      form.set('endpoint', json.endpoint ?? '');
      form.set('p256dh', json.keys?.p256dh ?? '');
      form.set('auth', json.keys?.auth ?? '');
      form.set('deviceLabel', navigator.userAgent.slice(0, 80));
      subscribe(form);
    } catch {
      setProblem(t.push.failed);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setProblem(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const form = new FormData();
      form.set('endpoint', subscription?.endpoint ?? '');
      await subscription?.unsubscribe();
      unsubscribe(form);
      setOn(false);
    } catch {
      setProblem(t.push.failed);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  if (!publicKey) return null;

  const label = on ? t.push.disable : t.push.enable;
  return (
    <div className="relative">
      <button
        type="button"
        className={`relative grid h-9 w-9 place-items-center rounded-full transition-colors disabled:cursor-wait disabled:opacity-60 ${on ? 'bg-brand-900/60 text-brand-300 hover:bg-brand-900' : 'text-ink-400 hover:bg-ink-800 hover:text-ink-100'}`}
        aria-label={label}
        title={label}
        aria-pressed={on === true}
        aria-expanded={open}
        disabled={on === null || busy || actionPending}
        onClick={() => {
          if (on) void turnOff();
          else void turnOn();
        }}
      >
        {on ? <IconBell width={19} height={19} /> : <IconBellOff width={19} height={19} />}
        {on ? <span className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" /> : null}
        <span className="sr-only">{label}</span>
      </button>
      {open ? (
        <div role="status" className="absolute end-0 top-11 z-50 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-ink-600 bg-ink-850 p-3 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-ink-100">{t.push.title}</p>
              <p className="mt-1 text-xs leading-5 text-ink-400">{t.push.hint}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={t.common.close} className="text-lg leading-none text-ink-400 hover:text-ink-100">×</button>
          </div>
          {problem ? <div className="mt-2"><Notice tone="info">{problem}</Notice></div> : null}
          {on ? <p className="mt-2 text-xs font-semibold text-ok-text">{t.push.on}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
