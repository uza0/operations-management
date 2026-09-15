import Link from 'next/link';
import type { ReactNode } from 'react';

import { logoutAction } from '@/server/actions/auth';
import { getT } from '@/lib/i18n/server';
import type { SessionUser } from '@/server/auth/session';
import { IconLogout } from '@/components/ui/icons';
import { LocaleSwitcher } from '@/components/ui/client';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';

import type { NavSection } from './nav';
import { DesktopNav, MobileNav, MobileTabBar } from './SidebarNav';

/**
 * The operational frame.
 *
 * Desktop keeps a persistent left rail. Below `lg` the rail becomes a drawer
 * and the five most-used sections move to a thumb-reachable bottom tab bar —
 * a Team Leader on a phone should not have to open a menu to get from gates to
 * assignments while standing at a gate.
 */
export async function AppShell({
  user,
  sections,
  children,
  contextTitle,
  contextSubtitle,
  homeHref,
}: {
  user: SessionUser;
  sections: NavSection[];
  children: ReactNode;
  contextTitle?: string;
  contextSubtitle?: string;
  homeHref: string;
}) {
  const { locale, t } = await getT();
  const tabs = sections.flatMap((section) => section.items).slice(0, 5);

  return (
    <div className="flex min-h-screen bg-ink-950">
      {/* Rail ------------------------------------------------------------- */}
      <aside className="app-chrome sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-e border-ink-800 bg-ink-900/60 lg:flex">
        <div className="border-b border-ink-800 px-4 py-4">
          <Link href={homeHref} className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-600 text-[15px] font-bold text-white"
            >
              OM
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[14.5px] font-bold text-ink-100">
                {t.app.name}
              </span>
              <span className="block truncate text-[11.5px] text-ink-500">
                {t.app.tagline}
              </span>
            </span>
          </Link>
        </div>

        {contextTitle ? (
          <div className="border-b border-ink-800 px-4 py-3">
            <p className="truncate text-[14px] font-semibold text-ink-100">{contextTitle}</p>
            {contextSubtitle ? (
              <p className="mt-0.5 truncate text-[12px] text-ink-400">{contextSubtitle}</p>
            ) : null}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-2.5 py-4">
          <DesktopNav sections={sections} />
        </div>

        <div className="border-t border-ink-800 px-4 py-3">
          <p className="text-[11.5px] text-ink-500">{t.common.signedInAs}</p>
          <p className="truncate text-[13.5px] font-semibold text-ink-200">{user.name}</p>
          <p className="text-[11.5px] text-ink-500">{t.enums.role[user.role]}</p>
        </div>
      </aside>

      {/* Main -------------------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner t={t} />

        <header className="app-chrome sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-ink-800 bg-ink-950/90 px-3 py-2.5 backdrop-blur pt-[max(0.625rem,env(safe-area-inset-top))] sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <MobileNav
              sections={sections}
              title={contextTitle ?? t.app.name}
              menuLabel={t.nav.overview}
            />
            <div className="min-w-0 lg:hidden">
              <p className="truncate text-[14px] font-semibold text-ink-100">
                {contextTitle ?? t.app.name}
              </p>
              {contextSubtitle ? (
                <p className="truncate text-[11.5px] text-ink-500">{contextSubtitle}</p>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <LocaleSwitcher locale={locale} labels={{ ar: 'العربية', en: 'English' }} />
            <form action={logoutAction}>
              <button type="submit" className="btn-ghost btn-sm" title={t.common.logout}>
                <IconLogout width={16} height={16} />
                <span className="hidden sm:inline">{t.common.logout}</span>
              </button>
            </form>
          </div>
        </header>

        <main
          id="main"
          className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-4 pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-7 lg:pb-7"
        >
          {children}
        </main>

        <MobileTabBar items={tabs} />
      </div>

      <InstallPrompt t={t} />
    </div>
  );
}
