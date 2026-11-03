/**
 * Service worker — TicketZone Ops.
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

/*
 * Bumping this retires every old cache on the next visit. Static assets are
 * served cache-first, so a device that already holds the previous icons
 * would otherwise keep showing them for as long as the app stays installed —
 * which is why a new mark needs a new version here, not only new files.
 */
const VERSION = 'ops-v4';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = '/offline.html';

const PRECACHE = [
  OFFLINE_URL,
  '/favicon.ico',
  '/icons/favicon-48.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
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

/**
 * Which build the cached pages belong to.
 *
 * A page is cached so that a dead connection shows the last known copy rather
 * than nothing. But a page cached from an EARLIER deploy is a trap: its HTML
 * names script chunks by a hash that no longer exists on the server, so the
 * browser fetches them, gets a 404, and the app dies during render with a
 * message that tells nobody anything. It looked random because it needed a
 * network hiccup to happen first.
 *
 * So the page cache belongs to one build. Every page tells the worker which
 * build it came from, and the moment that differs from what the cache was
 * filled for, the cache goes — pages and chunks both, since the chunk names
 * are what went stale.
 */
let buildId = null;

async function dropStaleCaches(incoming) {
  if (!incoming || incoming === buildId) return;
  buildId = incoming;
  await Promise.all([
    caches.delete(PAGE_CACHE),
    /*
     * The chunks too. They are content-hashed, so keeping them is harmless in
     * itself — but a cache that only ever grows across deploys is a phone
     * filling up with the scripts of every version it has ever seen.
     */
    caches.delete(STATIC_CACHE).then(() =>
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)),
    ),
  ]);
}

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data && event.data.type === 'BUILD') {
    event.waitUntil(dropStaleCaches(event.data.id));
  }
});

/*
 * Being told something while the app is shut.
 *
 * The payload is already decrypted by the time it arrives here — the browser
 * does that with the keys it gave us when he subscribed — so this only has to
 * read it and show it. Anything thrown in here means a notification the user
 * never sees, so every field has a fallback and the whole thing is wrapped.
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || 'TicketZone Ops';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/favicon-48.png',
    /*
     * Same tag, same slot: a reminder that arrives twice replaces itself
     * rather than stacking two identical lines in his shade.
     */
    tag: data.tag || 'ops',
    renotify: Boolean(data.tag),
    dir: 'rtl',
    lang: 'ar',
    data: { url: data.url || '/me' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/*
 * Tapping it.
 *
 * If the app is already open somewhere, that window is brought forward and
 * sent to the page rather than a second one being opened — a promoter with
 * four copies of his own page open is how a phone ends up feeling broken.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/me';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
