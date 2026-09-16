import type { Dictionary } from '@/lib/i18n';
import type { Role } from '@/lib/constants';

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Exact match only — used for the section root. */
  exact?: boolean;
};

export type NavSection = {
  label?: string;
  items: NavItem[];
};

/** Top-level navigation, scoped by role (spec §36). */
export function globalNav(t: Dictionary, role: Role): NavSection[] {
  if (role === 'ADMIN') {
    return [
      {
        items: [
          { href: '/admin', label: t.nav.dashboard, icon: 'dashboard', exact: true },
          { href: '/admin/events', label: t.nav.events, icon: 'calendar' },
          { href: '/admin/venues', label: t.nav.venues, icon: 'pin' },
          { href: '/admin/team', label: t.nav.team, icon: 'users' },
          { href: '/admin/credits', label: t.nav.credits, icon: 'report' },
          { href: '/admin/settings', label: t.nav.settings, icon: 'settings' },
        ],
      },
    ];
  }
  return [
    {
      items: [
        { href: '/leader', label: t.nav.dashboard, icon: 'dashboard', exact: true },
        { href: '/leader/events', label: t.nav.myEvents, icon: 'calendar' },
      ],
    },
  ];
}

/** Event workspace navigation (spec §22). */
export function eventNav(
  t: Dictionary,
  base: '/admin' | '/leader',
  eventId: string,
  canManage: boolean,
): NavSection[] {
  const root = `${base}/events/${eventId}`;
  const core: NavItem[] = [
    { href: root, label: t.nav.overview, icon: 'dashboard', exact: true },
    { href: `${root}/map`, label: t.nav.map, icon: 'map' },
    { href: `${root}/gates`, label: t.nav.gates, icon: 'gate' },
    { href: `${root}/team`, label: t.nav.team, icon: 'users' },
    { href: `${root}/assignments`, label: t.nav.assignments, icon: 'clipboard' },
    { href: `${root}/attendance`, label: t.nav.attendance, icon: 'checkCircle' },
  ];
  const ops: NavItem[] = [
    { href: `${root}/notify`, label: t.nav.notify, icon: 'megaphone' },
    { href: `${root}/timeline`, label: t.nav.timeline, icon: 'clock' },
    { href: `${root}/announcements`, label: t.nav.announcements, icon: 'megaphone' },
    { href: `${root}/issues`, label: t.nav.issues, icon: 'alert' },
  ];
  const closing: NavItem[] = [
    { href: `${root}/reports`, label: t.nav.reports, icon: 'report' },
    { href: `${root}/activity`, label: t.nav.activity, icon: 'history' },
  ];

  if (!canManage) {
    // Gate leaders get a deliberately narrow view (spec §3.3).
    return [
      {
        items: [
          { href: root, label: t.nav.overview, icon: 'dashboard', exact: true },
          { href: `${root}/team`, label: t.nav.team, icon: 'users' },
          { href: `${root}/map`, label: t.nav.map, icon: 'map' },
          { href: `${root}/attendance`, label: t.nav.attendance, icon: 'checkCircle' },
          { href: `${root}/announcements`, label: t.nav.announcements, icon: 'megaphone' },
          { href: `${root}/issues`, label: t.nav.issues, icon: 'alert' },
        ],
      },
    ];
  }

  return [{ items: core }, { items: ops }, { items: closing }];
}
