import type { ReactNode } from 'react';

import { getT } from '@/lib/i18n/server';
import { LocaleSwitcher } from '@/components/ui/client';
import { ThemeToggle } from '@/components/pwa/ThemeToggle';
import { getLocale } from '@/lib/i18n/server';
import { IconAlert } from '@/components/ui/icons';
import { BrandMark } from '@/components/ui/BrandMark';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';

/**
 * A deliberately separate shell from the admin app: single column, large
 * targets, no sidebar, nothing to navigate. Built for a phone held in one hand
 * at a stadium gate (spec §34 / §37).
 *
 * The bar carries the product, not the event. It used to carry both the
 * greeting and the event name and type and date, squeezed into three lines of
 * 12–15px beside two icon buttons — which made the most important fact on the
 * page (which match, where) the smallest thing on it. The event now has a card
 * of its own below, with room to be read at arm's length, and the bar is left
 * to do the one job a sticky bar is good at: staying out of the way.
 */
export async function MemberShell({
  children,
}: {
  t?: unknown;
  children: ReactNode;
}) {
  const locale = await getLocale();
  const { t } = await getT();

  return (
    <div className="min-h-screen bg-ink-950">
      <OfflineBanner t={t} />

      <header className="sticky top-0 z-30 border-b border-ink-700 bg-ink-950/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-[560px] items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandMark size={28} className="shrink-0 text-brand-600" />
            <span
              className="truncate text-[14px] font-bold text-ink-100"
              style={{ unicodeBidi: 'plaintext' }}
            >
              {t.app.name}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle t={t} />
            <LocaleSwitcher locale={locale} labels={{ ar: 'العربية', en: 'English' }} />
          </div>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto w-full max-w-[560px] space-y-4 px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        {children}
      </main>

      <InstallPrompt t={t} />
    </div>
  );
}

export async function InvalidToken({
  title,
  hint,
}: {
  title: string;
  hint: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-[420px] p-6 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full border border-crit/50 bg-crit/12 text-crit-text">
          <IconAlert width={22} height={22} />
        </div>
        <h1 className="text-[17px] font-bold text-ink-100">{title}</h1>
        <p className="mt-2 text-[13.5px] leading-6 text-ink-400">{hint}</p>
      </div>
    </div>
  );
}
