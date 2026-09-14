'use client';

import { useEffect, useState } from 'react';

import { IconClose, IconUpload } from '@/components/ui/icons';
import type { Dictionary } from '@/lib/i18n';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'ops_install_dismissed';

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS reports installed apps only through this legacy flag.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ reports itself as a Mac; touch points give it away.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * Install invitation.
 *
 * Android and desktop Chrome hand us a real prompt event; iOS has no such API,
 * so there the only honest thing is to show the two manual steps. Either way
 * it appears once, is dismissible, and never shows to someone who already
 * installed the app.
 */
export function InstallPrompt({ t }: { t: Dictionary }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      // Private browsing can block storage; treat it as "not dismissed".
    }
    if (dismissed) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // iOS never fires the event, so offer the manual route after a short delay
    // rather than interrupting the first paint.
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isIos()) {
      timer = setTimeout(() => setShowIosHint(true), 2500);
    }

    const onInstalled = () => {
      setDeferred(null);
      setShowIosHint(false);
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Nothing to do — the prompt simply reappears next visit.
    }
    setDeferred(null);
    setShowIosHint(false);
  }

  if (!deferred && !showIosHint) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-sm rounded-xl border border-ink-600 bg-ink-850 p-4 shadow-panel pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14.5px] font-semibold text-ink-100">
            {deferred ? t.pwa.installTitle : t.pwa.iosTitle}
          </p>
          {deferred ? (
            <p className="mt-1 text-[12.5px] leading-5 text-ink-400">
              {t.pwa.installBody}
            </p>
          ) : (
            <ol className="mt-1.5 space-y-1 text-[12.5px] leading-5 text-ink-400">
              <li>1. {t.pwa.iosStep1}</li>
              <li>2. {t.pwa.iosStep2}</li>
            </ol>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="btn-ghost btn-sm shrink-0"
          aria-label={t.common.close}
        >
          <IconClose width={17} height={17} />
        </button>
      </div>

      {deferred ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="btn-primary btn-sm flex-1"
            onClick={async () => {
              const event = deferred;
              setDeferred(null);
              await event.prompt();
              const choice = await event.userChoice;
              if (choice.outcome === 'dismissed') dismiss();
            }}
          >
            <IconUpload width={15} height={15} />
            {t.pwa.installAction}
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={dismiss}>
            {t.pwa.later}
          </button>
        </div>
      ) : null}
    </div>
  );
}
