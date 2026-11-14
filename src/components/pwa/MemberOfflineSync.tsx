'use client';

import { useEffect, useState } from 'react';

/**
 * Keeps every screen a promoter has on this phone, as of the last time it
 * was online.
 *
 * A stadium is where the network goes. Saving only the page he happened to
 * have open meant that the evening's own page, the one with the "I arrived"
 * button, was there only if he had remembered to open it before he lost
 * signal. So whenever any of his screens loads with a connection, the worker
 * is handed the whole set — his home, his events, his attendance, his
 * account, and the page of every evening still ahead of him — and fetches
 * them in the background.
 *
 * `owner` is an opaque per-person key: a phone handed to somebody else, who
 * signs in as himself, must not be able to read the first man's pages with
 * the network off. The worker throws the lot away the moment it changes.
 */
const KEY = 'ops-offline-sync';
const EVERY_MS = 2 * 60 * 1000;

export function MemberOfflineSync({ owner, urls }: { owner: string; urls: string[] }) {
  const signature = `${owner}|${urls.join(',')}`;

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !navigator.onLine) return;

    /*
     * Not on every tap between tabs: once every couple of minutes is plenty —
     * unless the saved copy is gone, which a new release does to it.
     */
    const recentlySynced = async () => {
      try {
        const last = JSON.parse(localStorage.getItem(KEY) ?? 'null') as
          | { at: number; signature: string }
          | null;
        if (!last || last.signature !== signature || Date.now() - last.at >= EVERY_MS) return false;
        return (await caches.keys()).some((name) => name.endsWith('-pages'));
      } catch {
        return false;
      }
    };

    /* A worker still installing is waited for, then let in. */
    const settled = (worker: ServiceWorker) =>
      new Promise<void>((resolve) => {
        if (worker.state !== 'installing') return resolve();
        worker.addEventListener('statechange', () => {
          if (worker.state !== 'installing') resolve();
        });
      });

    const run = async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return;
      await registration.update().catch(() => {});
      if (registration.installing) await settled(registration.installing);
      /*
       * A newer worker that is only waiting cannot do any of this: the old
       * one in charge does not know the message and would quietly drop it,
       * leaving him with nothing saved and no way to know. On his own screens
       * there is nothing half-typed to lose, so the new one is let in now —
       * the page reloads once, and this runs again under it.
       */
      if (registration.waiting) {
        registration.waiting.postMessage('SKIP_WAITING');
        return;
      }
      const worker = navigator.serviceWorker.controller;
      if (!worker || (await recentlySynced())) return;
      worker.postMessage({
        type: 'SYNC_MEMBER_PAGES',
        owner,
        urls: urls.map((path) => new URL(path, window.location.origin).href),
      });
      try {
        localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), signature }));
      } catch {
        /* ignore */
      }
    };

    /* After the page itself has settled, so this never competes with it. */
    const timer = window.setTimeout(() => {
      void run().catch(() => {});
    }, 1500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return null;
}

/** Signed out, or on the sign-in screen: nothing of anybody's stays behind. */
export function ForgetOfflinePages() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    void navigator.serviceWorker.ready
      .then((registration) => registration.active?.postMessage({ type: 'FORGET_MEMBER_PAGES' }))
      .catch(() => {});
  }, []);
  return null;
}

/**
 * What this phone has saved, in words, on his account screen — so "does it
 * work offline?" is a thing he can look at rather than find out at the gate.
 */
export function OfflineStatus({
  labels,
}: {
  labels: { ready: string; none: string; title: string };
}) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!('caches' in window)) return;
    void (async () => {
      try {
        const names = await caches.keys();
        const pages = names.find((name) => name.endsWith('-pages'));
        if (!pages) {
          setText(labels.none);
          return;
        }
        const keys = await (await caches.open(pages)).keys();
        const count = keys.filter((request) => !request.url.includes('__')).length;
        setText(count > 0 ? labels.ready.replace('{n}', String(count)) : labels.none);
      } catch {
        setText(labels.none);
      }
    })();
  }, [labels]);

  if (!text) return null;
  return (
    <p className="rounded-control border border-ink-700 bg-ink-900 px-3 py-2 text-[12.5px] text-ink-400">
      <span className="font-semibold text-ink-200">{labels.title}: </span>
      {text}
    </p>
  );
}
