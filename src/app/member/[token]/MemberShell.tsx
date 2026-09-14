import type { ReactNode } from 'react';

import { getT } from '@/lib/i18n/server';
import { LocaleSwitcher } from '@/components/ui/client';
import { getLocale } from '@/lib/i18n/server';
import { IconAlert } from '@/components/ui/icons';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';

/**
 * A deliberately separate shell from the admin app: single column, large
 * targets, no sidebar, nothing to navigate. Built for a phone held in one hand
 * at a stadium gate (spec §34 / §37).
 */
export async function MemberShell({
  title,
  subtitle,
  memberName,
  children,
}: {
  t: unknown;
  title: string;
  subtitle: string;
  memberName: string;
  children: ReactNode;
}) {
  const locale = await getLocale();
  const { t } = await getT();

  return (
    <div className="min-h-screen bg-ink-950">
      <OfflineBanner t={t} />

      <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-[560px] items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] text-ink-400">
              {t.member.welcome}، <span className="font-semibold text-ink-100">{memberName}</span>
            </p>
            <p className="truncate text-[15px] font-bold text-ink-100">{title}</p>
            <p className="truncate text-[12px] text-ink-500">{subtitle}</p>
          </div>
          <LocaleSwitcher locale={locale} labels={{ ar: 'العربية', en: 'English' }} />
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
