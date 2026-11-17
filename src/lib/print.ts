'use client';

import { useEffect } from 'react';

/**
 * Printing — and with it "Save as PDF" — from inside the installed app.
 *
 * Chrome on Android does nothing on `window.print()` once the site runs as an
 * installed app, and handing the page to the browser lands straight back in
 * the app. So in the installed app the button downloads a PDF the server
 * makes from the same page with the same print stylesheet. Everywhere else
 * the browser's own print dialog is still used.
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

/**
 * Downloads the page as a PDF made on the server (see app/api/pdf). The file
 * is named after the page's title.
 */
function downloadPdf(url: URL) {
  url.searchParams.delete('print');
  const api = new URL('/api/pdf', window.location.origin);
  api.searchParams.set('path', url.pathname + url.search);
  api.searchParams.set('name', document.title.split('|')[0].trim());
  window.location.href = api.toString();
}

/**
 * Print this page, or — given `href` — another one.
 *
 * Returns true when it handled the click, so a link can skip its own
 * navigation.
 */
export function printPage(href?: string): boolean {
  if (isInstalledAndroid()) {
    downloadPdf(withPrintFlag(href ?? window.location.href));
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
