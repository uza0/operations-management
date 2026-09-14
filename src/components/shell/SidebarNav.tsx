'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { NavItem, NavSection } from './nav';
import {
  IconAlert,
  IconCalendar,
  IconCheckCircle,
  IconClipboard,
  IconClock,
  IconClose,
  IconDashboard,
  IconGate,
  IconHistory,
  IconMap,
  IconMegaphone,
  IconMenu,
  IconPin,
  IconReport,
  IconSettings,
  IconUsers,
} from '@/components/ui/icons';

const ICONS: Record<string, React.ComponentType<{ width?: number; height?: number }>> = {
  dashboard: IconDashboard,
  calendar: IconCalendar,
  pin: IconPin,
  users: IconUsers,
  settings: IconSettings,
  map: IconMap,
  gate: IconGate,
  clipboard: IconClipboard,
  checkCircle: IconCheckCircle,
  clock: IconClock,
  megaphone: IconMegaphone,
  alert: IconAlert,
  report: IconReport,
  history: IconHistory,
};

function NavList({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-5">
      {sections.map((section, i) => (
        <div key={i}>
          {section.label ? (
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              {section.label}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon] ?? IconDashboard;
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors ${
                      active
                        ? 'bg-brand-500/12 text-brand-300 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.25)]'
                        : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100'
                    }`}
                  >
                    <Icon width={17} height={17} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function DesktopNav({ sections }: { sections: NavSection[] }) {
  return <NavList sections={sections} />;
}

/**
 * Thumb-reachable navigation for phones. It carries the sections a leader
 * touches most during an event; everything else stays in the drawer.
 */
export function MobileTabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  if (items.length === 0) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-800 bg-ink-900/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="primary"
    >
      <ul className="flex items-stretch">
        {items.map((item) => {
          const Icon = ICONS[item.icon] ?? IconDashboard;
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-medium transition-colors ${
                  active ? 'text-brand-300' : 'text-ink-400'
                }`}
              >
                <Icon width={20} height={20} />
                <span className="w-full truncate text-center">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MobileNav({
  sections,
  title,
  menuLabel,
}: {
  sections: NavSection[];
  title: string;
  menuLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <button
        type="button"
        className="btn-secondary btn-sm lg:hidden"
        onClick={() => setOpen(true)}
        aria-label={menuLabel}
        aria-expanded={open}
      >
        <IconMenu width={18} height={18} />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 bg-black/70 lg:hidden"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="ms-0 h-full w-[290px] max-w-[85vw] overflow-y-auto border-e border-ink-700 bg-ink-900 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[15px] font-semibold text-ink-100">{title}</p>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setOpen(false)}
                aria-label="close"
              >
                <IconClose width={18} height={18} />
              </button>
            </div>
            <NavList sections={sections} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
