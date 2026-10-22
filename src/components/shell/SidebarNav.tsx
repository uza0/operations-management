'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

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
                        ? 'bg-brand-50 text-brand-900 shadow-[inset_0_0_0_1px_rgb(var(--brand-600)/0.28)]'
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
      className="app-chrome fixed inset-x-0 bottom-0 z-40 border-t border-ink-800 bg-ink-900/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden"
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

  // Escape closes it, and the page behind must not scroll under the drawer —
  // on a phone that reads as the menu "sliding away" while you touch it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const drawer = (
    <div
      className="fixed inset-0 z-[80] flex bg-black/70 lg:hidden"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex h-full w-[290px] max-w-[85vw] flex-col overflow-y-auto overscroll-contain border-e border-ink-700 bg-ink-900 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[15px] font-semibold text-ink-100">{title}</p>
          <button
            type="button"
            className="btn-ghost btn-sm shrink-0"
            onClick={() => setOpen(false)}
            aria-label="close"
          >
            <IconClose width={18} height={18} />
          </button>
        </div>
        <NavList sections={sections} onNavigate={() => setOpen(false)} />
      </div>
    </div>
  );

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

      {/*
        Rendered into <body>, not where it sits in the tree.

        The header above it carries `backdrop-blur`, and a backdrop-filter makes
        an element the containing block for every fixed-position descendant. The
        drawer's `inset-0` was therefore resolving against the 62px-tall header
        instead of the viewport, so the menu opened as a thin strip across the
        top — which is exactly what it looked like on Android. A portal takes it
        out of that ancestor entirely.
      */}
      {open && typeof document !== 'undefined'
        ? createPortal(drawer, document.body)
        : null}
    </>
  );
}
