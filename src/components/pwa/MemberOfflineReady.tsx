'use client';

import { useEffect, useState } from 'react';

import type { Dictionary } from '@/lib/i18n';

export function MemberOfflineReady({ t }: { t: Dictionary }) {
  const [state, setState] = useState<'preparing' | 'ready' | 'failed'>('preparing');

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setState('failed');
      return;
    }

    const pageUrl = window.location.href;
    const assets = [
      ...Array.from(document.scripts, (script) => script.src),
      ...Array.from(
        document.querySelectorAll<HTMLLinkElement>(
          'link[rel="stylesheet"], link[rel="preload"][as="font"]',
        ),
        (link) => link.href,
      ),
      ...Array.from(document.images, (image) => image.currentSrc || image.src),
      ...Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe[src]'), (frame) => frame.src),
      ...Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'), (link) => link.href),
    ].filter(Boolean);
    const cachePage = () => {
      const worker = navigator.serviceWorker.controller;
      if (worker) worker.postMessage({ type: 'CACHE_MEMBER_PAGE', url: pageUrl, assets });
    };
    const onMessage = (event: MessageEvent) => {
      if (
        event.data?.type === 'MEMBER_PAGE_CACHE_RESULT' &&
        event.data.url === pageUrl
      ) {
        setState(event.data.ok ? 'ready' : 'failed');
      }
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    navigator.serviceWorker.addEventListener('controllerchange', cachePage);
    void navigator.serviceWorker.ready.then(cachePage).catch(() => setState('failed'));

    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      navigator.serviceWorker.removeEventListener('controllerchange', cachePage);
    };
  }, []);

  const message =
    state === 'ready'
      ? t.pwa.offlinePageReady
      : state === 'failed'
        ? t.pwa.offlinePageFailed
        : t.pwa.offlinePagePreparing;

  return (
    <p
      role="status"
      className={`rounded-control border px-3 py-2 text-[12.5px] leading-5 ${
        state === 'ready'
          ? 'border-ok/30 bg-ok/10 text-ok-text'
          : state === 'failed'
            ? 'border-warn/30 bg-warn/10 text-warn-text'
            : 'border-ink-700 bg-ink-900 text-ink-400'
      }`}
    >
      {message}
    </p>
  );
}
