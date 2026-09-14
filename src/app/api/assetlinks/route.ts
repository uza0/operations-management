import { NextResponse } from 'next/server';

import { ANDROID_APP_LINKS } from './links';

/**
 * Digital Asset Links — what makes a member's link open inside the Android app
 * instead of the browser.
 *
 * Android checks `https://<this site>/.well-known/assetlinks.json` when the app
 * is installed. If the file names that app's package and its signing
 * fingerprint, every link on this domain is handed to the app: the same QR code
 * and the same link keep working for people who don't have it installed, and
 * open the app for people who do. It also removes the browser address bar
 * inside the app.
 *
 * Configured entirely by environment variables, so the values from the
 * PWABuilder package can be pasted into the host's settings with no code
 * change and no deploy from a laptop:
 *
 *   ASSET_LINKS_JSON            the whole file, verbatim (what PWABuilder hands you)
 *   — or —
 *   ANDROID_PACKAGE_NAME        e.g. app.vercel.operations_management_two.twa
 *   ANDROID_SHA256_FINGERPRINT  AB:CD:… (one, or several separated by commas)
 *
 * With neither set it falls back to links.ts, which holds the values for the
 * app that ships with this project.
 *
 * Served at /.well-known/assetlinks.json through a rewrite in next.config.mjs —
 * a dot-folder inside public/ is not reliably served by every host.
 */

export const dynamic = 'force-dynamic';

const HEADERS = {
  'content-type': 'application/json',
  // Android re-checks periodically; an hour is short enough to fix a mistake
  // quickly and long enough not to be re-fetched on every launch.
  'cache-control': 'public, max-age=3600',
};

export async function GET() {
  const verbatim = process.env.ASSET_LINKS_JSON?.trim();
  if (verbatim) {
    try {
      // Parse before serving: a malformed file fails Android's check silently,
      // which is a miserable thing to debug on a phone.
      const parsed = JSON.parse(verbatim);
      return new NextResponse(JSON.stringify(parsed), { headers: HEADERS });
    } catch {
      return NextResponse.json(
        { error: 'ASSET_LINKS_JSON is not valid JSON' },
        { status: 500 },
      );
    }
  }

  const packageName = process.env.ANDROID_PACKAGE_NAME?.trim();
  const fingerprints = (process.env.ANDROID_SHA256_FINGERPRINT ?? '')
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);

  if (!packageName || fingerprints.length === 0) {
    // Nothing configured by the environment — serve the app this project ships
    // with. An empty list here means the site has no Android app at all.
    if (ANDROID_APP_LINKS.length === 0) {
      return new NextResponse('Not found', { status: 404 });
    }
    return new NextResponse(JSON.stringify(ANDROID_APP_LINKS), { headers: HEADERS });
  }

  return new NextResponse(
    JSON.stringify([
      {
        relation: [
          'delegate_permission/common.handle_all_urls',
          'delegate_permission/common.get_login_creds',
        ],
        target: {
          namespace: 'android_app',
          package_name: packageName,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ]),
    { headers: HEADERS },
  );
}
