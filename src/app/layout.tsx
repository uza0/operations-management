import type { Metadata, Viewport } from 'next';

import { getLocale } from '@/lib/i18n/server';
import { dirFor, getDictionary } from '@/lib/i18n';
import { AppRuntime } from '@/components/pwa/AppRuntime';
import { themeScript } from '@/components/pwa/ThemeToggle';

import './globals.css';

export const metadata: Metadata = {
  title: 'إدارة العمليات — منصة فرق الفعاليات وعمليات البوابات',
  description:
    'منصة داخلية لإدارة فرق الفعاليات: البوابات، التوزيع، الحضور، الإعلانات، المشاكل والتقارير.',
  applicationName: 'إدارة العمليات',
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'إدارة العمليات',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  /* The browser chrome matches whichever theme the device asks for. */
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0908' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
  /** Lets the app paint under the notch; safe-area padding is in globals.css. */
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const dir = dirFor(locale);
  const t = getDictionary(locale);

  return (
    <html lang={locale} dir={dir}>
      <head>
        {/*
          Next emits the modern `mobile-web-app-capable`, but iOS still reads
          the legacy name to decide whether an installed app opens without
          Safari's chrome. Both are needed for "Add to Home Screen" to behave
          like an app.
        */}
        <meta name="apple-mobile-web-app-capable" content="yes" />

        {/*
          Applies the stored theme before the first paint. Inline and
          synchronous on purpose: anything deferred lets the page paint in the
          wrong theme first, which on a phone in a dark stadium is a white
          flash in someone's face.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />

        {/*
          The house font is served from this origin, so there is no third
          party to warm a connection to. It is preloaded instead: the Arabic
          regular and bold are what the first screen is set in, and fetching
          them alongside the HTML saves a round trip on a weak connection.
        */}
        <link
          rel="preload"
          href="/fonts/nsa-arabic-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin=""
        />
        <link
          rel="preload"
          href="/fonts/nsa-arabic-700.woff2"
          as="font"
          type="font/woff2"
          crossOrigin=""
        />
      </head>
      <body>
        <a href="#main" className="skip-link">
          {t.nav.overview}
        </a>
        {children}
        <AppRuntime />
      </body>
    </html>
  );
}
