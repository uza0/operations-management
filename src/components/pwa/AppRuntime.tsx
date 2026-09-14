'use client';

import { useEffect, useState } from 'react';

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap';

/**
 * Client bootstrap, mounted once in the root layout.
 *
 *  1. Marks the document hydrated, so it is visible from the outside when the
 *     page became interactive.
 *  2. Loads the Arabic webfont *after* first paint. A stylesheet in <head>
 *     blocks rendering until it resolves, and at a stadium — patchy signal,
 *     possibly a captive portal — that can mean staring at a blank screen
 *     waiting for a font. The fallback stack renders immediately and the
 *     webfont swaps in when it arrives, or never, and the page still works.
 *  3. Registers the service worker in production, and offers a reload when a
 *     new build is waiting rather than swapping the app out mid-shift.
 */
export function AppRuntime() {
  const [waiting, setWaiting] = useState<globalThis.ServiceWorker | null>(null);

  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true';
  }, []);

  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_HREF;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;

    /**
     * Whether a worker was already in charge when this page loaded. On a first
     * visit the freshly installed worker calls clients.claim(), which fires
     * `controllerchange` — reloading there would throw away whatever the user
     * was doing on their very first page. Only a genuine update, where a
     * controller was already present, justifies a reload.
     */
    const hadController = Boolean(navigator.serviceWorker.controller);

    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        if (registration.waiting) setWaiting(registration.waiting);

        registration.addEventListener('updatefound', () => {
          const installing = registration?.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              setWaiting(installing);
            }
          });
        });
      } catch {
        // A failed registration must never break the app.
      }
    };

    void register();

    let reloading = false;
    const onControllerChange = () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  if (!waiting) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-sm rounded-xl border border-brand-500/45 bg-ink-850 p-3 shadow-panel">
      <p className="text-[13.5px] text-ink-200">يتوفر إصدار جديد من التطبيق.</p>
      <button
        type="button"
        className="btn-primary btn-sm mt-2 w-full"
        onClick={() => waiting.postMessage('SKIP_WAITING')}
      >
        تحديث الآن
      </button>
    </div>
  );
}
