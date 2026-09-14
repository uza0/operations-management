'use client';

import { useEffect, useState } from 'react';

import type { Dictionary } from '@/lib/i18n';

/**
 * A stadium's network drops. When it does, the team needs to know that what
 * they are looking at may be a cached copy — silence would be worse than a
 * small banner.
 */
export function OfflineBanner({ t }: { t: Dictionary }) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-[65] bg-warn/20 px-4 py-1.5 text-center text-[12.5px] font-medium text-warn-text"
    >
      {t.pwa.offline}
    </div>
  );
}
