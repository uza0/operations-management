'use client';

import { useEffect } from 'react';

/**
 * Printing — and with it "Save as PDF" — from inside the installed app.
 *
 * Chrome on Android does nothing on `window.print()` once the site runs as an
 * installed app, and a `target="_blank"` link stays inside that same app
 * window, so the button simply looked dead. The full Chrome browser prints
 * fine and shares the app's sign-in (they are one profile), so in the
 * installed app the page is handed to Chrome with `?print=1`, and the dialog
 * comes up there by itself. Everywhere else nothing changes.
 */
export function isInstalledAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches;
  return standalone && /Android/i.test(window.navigator.userAgent);
}

function withPrintFlag(href: string): URL {
  const url = new URL(href, window.location.href);
  url.searchParams.set('print', '1');
  return url;
}

/** Opens the page in the Chrome browser itself, out of the installed app. */
function openInChrome(url: URL) {
  const fallback = encodeURIComponent(url.toString());
  window.location.href =
    `intent://${url.host}${url.pathname}${url.search}${url.hash}` +
    `#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;` +
    `S.browser_fallback_url=${fallback};end`;
}

/**
 * Print this page, or — given `href` — another one.
 *
 * Returns true when it handled the click, so a link can skip its own
 * navigation.
 */
export function printPage(href?: string): boolean {
  if (isInstalledAndroid()) {
    openInChrome(withPrintFlag(href ?? window.location.href));
    return true;
  }
  if (href) return false;
  window.print();
  return true;
}

/** Brings the print dialog up on arrival when the address carries `?print=1`. */
export function useAutoPrint(force = false) {
  useEffect(() => {
    const flagged = new URLSearchParams(window.location.search).get('print') === '1';
    if (!force && !flagged) return;
    // In the app itself printing does nothing; the user presses the button.
    if (isInstalledAndroid()) return;
    // One frame after paint: printing a half-laid-out page prints a half page.
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [force]);
}
