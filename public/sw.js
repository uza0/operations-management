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
const VERSION = 'ops-v6';
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
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/docs/') ||
    url.pathname.startsWith('/uploads/') ||
    url.pathname === '/manifest.webmanifest'
  );
}

/** The promoter's own screens: his tabs, and his evenings' pages. */
function isMemberOfflinePath(pathname) {
  return (
    /^\/me(?:\/(?:events|attendance|account))?\/?$/.test(pathname) ||
    /^\/(?:member|setup)\/[^/]+\/?$/.test(pathname)
  );
}

function isPrivatePage(pathname) {
  return /^\/(?:admin|leader|me|settings|login)(?:\/|$)/.test(pathname) ||
    /^\/(?:member|setup)\/[^/]+\/?$/.test(pathname);
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
    const privatePage = isPrivatePage(url.pathname);
    const offlineMemberPage = isMemberOfflinePath(url.pathname);
    // Staff workspaces must never fall back to cached private data. A
    // promoter's own screens are the offline feature: saved by the sync
    // below, for the person signed in on this phone, and nobody else.
    if (privatePage && !offlineMemberPage) return;

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && !privatePage) {
            const copy = response.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request, { ignoreVary: true, ignoreSearch: false });
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
const META_CACHE = `${VERSION}-meta`;
/** The latest build check, so a sync never fills a cache that is about to go. */
let buildCheck = Promise.resolve();
const BUILD_KEY = '/__build__';

async function dropStaleCaches(incoming) {
  if (!incoming) return;
  /*
   * Remembered in a cache, not a variable: the browser stops an idle worker
   * whenever it likes, and a variable that comes back empty read as "a new
   * build" on the next page load — which wiped every saved page, including
   * the one being read offline at a gate.
   */
  const meta = await caches.open(META_CACHE);
  const stored = await meta.match(BUILD_KEY);
  const previous = stored ? await stored.text() : null;
  if (previous === incoming) return;
  await meta.put(BUILD_KEY, new Response(incoming));
  // The very first build this worker hears about has nothing stale to clear.
  if (previous === null) return;
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
    buildCheck = dropStaleCaches(event.data.id).catch(() => {});
    event.waitUntil(buildCheck);
    return;
  }
  if (event.data && event.data.type === 'FORGET_MEMBER_PAGES') {
    event.waitUntil(forgetMemberPages());
    return;
  }
  if (event.data && event.data.type === 'SYNC_MEMBER_PAGES') {
    event.waitUntil(syncMemberPages(event.data.owner, event.data.urls));
    return;
  }
  if (event.data && event.data.type === 'CACHE_MEMBER_PAGE') {
    const rawUrl = event.data.url;
    event.waitUntil(
      (async () => {
        let url;
        try {
          url = new URL(rawUrl);
        } catch {
          return;
        }
        const isMemberPage =
          url.origin === self.location.origin &&
          /^\/(?:member|setup)\/[^/]+\/?$/.test(url.pathname);
        if (!isMemberPage) return;

        let ok = false;
        try {
          const response = await fetch(
            new Request(url.href, {
              credentials: 'include',
              cache: 'no-store',
              headers: { accept: 'text/html' },
            }),
          );
          if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
            const cache = await caches.open(PAGE_CACHE);
            await cache.put(url.href, response.clone());
            ok = true;
          }
        } catch {
          ok = Boolean(await caches.match(url.href));
        }
        if (!ok) ok = Boolean(await caches.match(url.href));

        const assets = Array.isArray(event.data.assets) ? event.data.assets : [];
        const cacheable = assets
          .map((raw) => {
            try {
              const assetUrl = new URL(raw, self.location.origin);
              const path = assetUrl.pathname;
              const allowed =
                assetUrl.origin === self.location.origin &&
                (path.startsWith('/_next/static/') ||
                  path.startsWith('/fonts/') ||
                  path.startsWith('/docs/') ||
                  path.startsWith('/uploads/') ||
                  path.startsWith('/icons/') ||
                  path.startsWith('/maps/'));
              return allowed ? assetUrl : null;
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        if (cacheable.length > 0) {
          const cache = await caches.open(STATIC_CACHE);
          const outcomes = await Promise.all(
            cacheable.map(async (assetUrl) => {
              try {
                const response = await fetch(
                  new Request(assetUrl.href, { credentials: 'include', cache: 'no-store' }),
                );
                if (!response.ok) return false;
                await cache.put(assetUrl.href, response.clone());
                return true;
              } catch {
                return false;
              }
            }),
          );
          ok = ok && outcomes.every(Boolean);
        }

        if (event.source && 'postMessage' in event.source) {
          event.source.postMessage({ type: 'MEMBER_PAGE_CACHE_RESULT', url: rawUrl, ok });
        }
      })(),
    );
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

/* -------------------------------------------------------------------------- */
/* A promoter's screens, kept for when the network is gone                    */
/* -------------------------------------------------------------------------- */

/*
 * Whose pages these are. Kept in the cache itself, because a worker's
 * variables do not survive it being stopped, and the cache does.
 */
const OWNER_KEY = '/__offline-owner__';

async function forgetMemberPages() {
  await caches.delete(PAGE_CACHE);
}

/** The scripts, styles, fonts and pictures a saved page will ask for with no network. */
function assetsIn(html) {
  const found = new Set();
  const pattern = /(?:src|href)=["'](\/(?:_next\/static|fonts|uploads)\/[^"'?#]+)/g;
  let match;
  while ((match = pattern.exec(html))) found.add(match[1]);
  return [...found];
}

let syncing = null;

async function syncMemberPages(owner, urls) {
  // One at a time: two tabs opening together must not race each other.
  if (syncing) await syncing.catch(() => {});
  await buildCheck;
  syncing = (async () => {
    if (typeof owner !== 'string' || !owner || !Array.isArray(urls)) return;

    const cache = await caches.open(PAGE_CACHE);
    const stamp = await cache.match(OWNER_KEY);
    const previous = stamp ? await stamp.text() : null;
    if (previous !== owner) {
      // Somebody else's pages, or none yet: start clean, then claim it.
      await caches.delete(PAGE_CACHE);
    }
    const pages = await caches.open(PAGE_CACHE);
    await pages.put(OWNER_KEY, new Response(owner));

    const wanted = urls
      .map((raw) => {
        try {
          const url = new URL(raw);
          return url.origin === self.location.origin && isMemberOfflinePath(url.pathname)
            ? url
            : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .slice(0, 40);

    const assets = new Set();
    for (const url of wanted) {
      try {
        const response = await fetch(
          new Request(url.href, {
            credentials: 'include',
            cache: 'no-store',
            headers: { accept: 'text/html' },
          }),
        );
        // A sign-in page in place of his page means the session went: keep nothing.
        if (response.redirected || !response.ok) continue;
        if (!response.headers.get('content-type')?.includes('text/html')) continue;
        const html = await response.clone().text();
        await pages.put(url.href, response);
        for (const asset of assetsIn(html)) assets.add(asset);
      } catch {
        /* One page that failed is not a reason to stop the rest. */
      }
    }

    // Static files are content-hashed: fetch only what is not already here.
    const statics = await caches.open(STATIC_CACHE);
    await Promise.all(
      [...assets].map(async (path) => {
        const href = new URL(path, self.location.origin).href;
        if (await statics.match(href)) return;
        try {
          const response = await fetch(href, { credentials: 'include' });
          if (response.ok) await statics.put(href, response);
        } catch {
          /* ignore */
        }
      }),
    );
  })();
  return syncing;
}
