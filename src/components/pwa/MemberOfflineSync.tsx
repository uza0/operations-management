'use client';

import { useEffect } from 'react';

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

    /* Not on every tap between tabs: once every couple of minutes is plenty. */
    try {
      const last = JSON.parse(localStorage.getItem(KEY) ?? 'null') as
        | { at: number; signature: string }
        | null;
      if (last && last.signature === signature && Date.now() - last.at < EVERY_MS) return;
    } catch {
      /* Private mode and friends: just sync. */
    }

    const send = () => {
      const worker = navigator.serviceWorker.controller;
      if (!worker) return;
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
      void navigator.serviceWorker.ready.then(send).catch(() => {});
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
