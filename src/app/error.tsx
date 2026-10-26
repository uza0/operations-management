'use client';

import { useEffect, useState } from 'react';

import { ErrorState } from '@/components/ui/states';

/**
 * A script this page needs is no longer on the server.
 *
 * It happens after a deploy: the document was served from the worker's cache
 * and names its chunks by a hash the new build does not have. Nothing is
 * wrong with the app — the page is simply out of date — so the honest
 * response is to fetch it again rather than to show somebody at a gate a red
 * triangle and the word "unexpected".
 */
function isStalePage(error: Error): boolean {
  const text = `${error.name} ${error.message}`;
  return (
    /ChunkLoadError/i.test(text) ||
    /Loading chunk [\w-]+ failed/i.test(text) ||
    /Failed to fetch dynamically imported module/i.test(text) ||
    /Importing a module script failed/i.test(text)
  );
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    console.error(error);
    if (!isStalePage(error)) return;

    /*
     * Once, and only once. A reload loop on a page that is broken for some
     * other reason is worse than the error screen it was meant to replace,
     * so the attempt is remembered for this tab.
     */
    const KEY = 'ops-stale-reload';
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* Private window, blocked storage: fall through to the error screen. */
      return;
    }

    setRecovering(true);
    void (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch {
        /* Nothing to clear, or not allowed to. Reload anyway. */
      }
      window.location.reload();
    })();
  }, [error]);

  /* Clear the one-shot guard once a page renders without throwing. */
  useEffect(() => {
    if (recovering) return;
    try {
      sessionStorage.removeItem('ops-stale-reload');
    } catch {
      /* ignore */
    }
  }, [recovering]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-md">
        <ErrorState
          title={recovering ? 'جاري تحديث الصفحة' : 'حدث خطأ غير متوقع'}
          hint={
            recovering
              ? 'نزل تحديث للنظام — نعيد تحميل الصفحة.'
              : 'حاول مرة أخرى. إذا تكرر الخطأ، تواصل مع المشرف.'
          }
          action={
            recovering ? null : (
              <button type="button" className="btn-secondary" onClick={reset}>
                إعادة المحاولة
              </button>
            )
          }
        />
      </div>
    </div>
  );
}
