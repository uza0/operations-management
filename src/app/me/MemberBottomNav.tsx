'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconCalendar, IconCheckCircle, IconDashboard, IconUser } from '@/components/ui/icons';
import type { getT } from '@/lib/i18n/server';

type T = Awaited<ReturnType<typeof getT>>['t'];

const tabs = [
  { href: '/me', key: 'navHome', Icon: IconDashboard },
  { href: '/me/events', key: 'navEvents', Icon: IconCalendar },
  { href: '/me/attendance', key: 'navAttendance', Icon: IconCheckCircle },
  { href: '/me/account', key: 'navAccount', Icon: IconUser },
] as const;

export function MemberBottomNav({ t }: { t: T }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Promoter navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid max-w-[560px] grid-cols-4 px-2 py-2">
        {tabs.map(({ href, key, Icon }) => {
          const active = pathname === href || (href === '/me/events' && pathname.startsWith('/member/'));
          return (
            <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition-colors ${active ? 'text-brand-300' : 'text-ink-400 hover:text-ink-100'}`}>
              <Icon width={19} height={19} />
              <span>{t.memberAuth[key]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
