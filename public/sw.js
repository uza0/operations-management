/**
 * Service worker — Operations Management.
 *
 * The deal it makes, deliberately narrow:
 *   • Static assets (icons, the venue map, uploads, Next's build output) are
 *     cached and served cache-first. These are immutable and heavy, which is
 *     exactly what a weak stadium connection cannot afford to re-download.
 *   • Pages are always network-first. Operational data — who is at which gate,
 *     the latest urgent announcement — must never be served stale. If the
 *     network fails, the last successfully seen copy of that page is shown,
 *     and failing that the offline notice.
 *   • Anything that is not a GET, and anything under /api/, is never touched.
 *     Recording attendance offline and having it silently vanish would be
 *     worse than a clear failure.
 */

const VERSION = 'ops-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = '/offline.html';

const PRECACHE = [
  OFFLINE_URL,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/manifest.webmanifest',
];

/**
 * Note what is deliberately absent: skipWaiting() on install. A new build must
 * not take over a page someone is in the middle of using — it waits until the
 * "update now" button posts SKIP_WAITING.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/maps/') ||
    url.pathname.startsWith('/uploads/') ||
    url.pathname === '/manifest.webmanifest'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Writes and reads that must be live are left entirely alone.
  if (url.pathname.startsWith('/api/')) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          return (
            offline ??
            new Response('offline', {
              status: 503,
              headers: { 'content-type': 'text/plain; charset=utf-8' },
            })
          );
        }),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
