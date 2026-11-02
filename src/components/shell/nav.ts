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
          /*
           * Some of the people who run events also work them. Their promoter
           * session is a separate cookie, so this is a door, not a role
           * change: what it opens is still decided by that other session.
           */
          { href: '/me', label: t.memberAuth.openAsMember, icon: 'users' },
        ],
      },
    ];
  }
  const items: NavItem[] = [
    { href: '/leader', label: t.nav.dashboard, icon: 'dashboard', exact: true },
    { href: '/leader/events', label: t.nav.myEvents, icon: 'calendar' },
  ];

  /*
   * The accounts, for the team leader only. He is the one who hands the money
   * over and the one who gets asked whether it went out, so settling after
   * payday should not have to travel through somebody else. A gate leader has
   * no business here and does not see the link — nor reach the page, which
   * checks the role itself rather than trusting this menu.
   */
  if (role === 'TEAM_LEADER') {
    items.push({ href: '/leader/credits', label: t.nav.credits, icon: 'report' });
  }
  items.push({ href: '/me', label: t.memberAuth.openAsMember, icon: 'users' });

  return [{ items }];
}

/** Event workspace navigation (spec §22). */
export function eventNav(
  t: Dictionary,
  base: '/admin' | '/leader',
  eventId: string,
  canManage: boolean,
): NavSection[] {
  const root = `${base}/events/${eventId}`;
  /*
   * The way out, first and on its own. Inside an event every link leads
   * further in, and the only road back was the browser's own button or the
   * crumb above the title — which on a phone is the size of a grain of rice.
   */
  const home: NavItem[] = [
    { href: `${base}/events`, label: t.nav.home, icon: 'calendar' },
  ];
  const core: NavItem[] = [
    { href: root, label: t.nav.overview, icon: 'dashboard', exact: true },
    { href: `${root}/map`, label: t.nav.map, icon: 'map' },
    { href: `${root}/gates`, label: t.nav.gates, icon: 'gate' },
    { href: `${root}/team`, label: t.nav.team, icon: 'users' },
    /*
     * The board comes before the list. The board is where the work is done —
     * people are dragged onto sections — and the list is what that work
     * produces, so a menu that puts the list first offers the result before
     * the act.
     */
    { href: `${root}/board`, label: t.nav.board, icon: 'gate' },
    { href: `${root}/assignments`, label: t.nav.assignments, icon: 'clipboard' },
    { href: `${root}/attendance`, label: t.nav.attendance, icon: 'checkCircle' },
    /*
     * The day before, for the events that are built before they happen. It
     * sits after attendance because that is the order the work happens in on
     * the screen: the chairs are set, then the night is worked.
     */
    { href: `${root}/seats`, label: t.seatSetup.title, icon: 'clipboard' },
  ];
  const ops: NavItem[] = [
    { href: `${root}/notify`, label: t.nav.notify, icon: 'megaphone' },
    { href: `${root}/timeline`, label: t.nav.timeline, icon: 'clock' },
    { href: `${root}/announcements`, label: t.nav.announcements, icon: 'megaphone' },
    { href: `${root}/issues`, label: t.nav.issues, icon: 'alert' },
  ];
  const closing: NavItem[] = [
    /*
     * What the evening cost, beside what it paid. It sits with the closing
     * screens because that is when it is totalled, and it is management-only
     * for the same reason the report is.
     */
    { href: `${root}/expenses`, label: t.expense.title, icon: 'report' },
    { href: `${root}/reports`, label: t.nav.reports, icon: 'report' },
    { href: `${root}/activity`, label: t.nav.activity, icon: 'history' },
  ];

  if (!canManage) {
    // Gate leaders get a deliberately narrow view (spec §3.3).
    return [
      { items: home },
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

  return [{ items: home }, { items: core }, { items: ops }, { items: closing }];
}
