import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getT } from '@/lib/i18n/server';
import { requireEventScope, type EventScope } from '@/server/auth/rbac';
import { getEventOr404 } from '@/server/services/events';
import { AppShell } from '@/components/shell/AppShell';
import { eventNav } from '@/components/shell/nav';
import { formatDate, formatTime } from '@/lib/time';
import type { EventStatus, EventType } from '@/lib/constants';

/**
 * One workspace, two mount points: /admin/events/[id]/* and
 * /leader/events/[id]/*. The routes differ, the shell and the guard do not.
 */
export async function EventWorkspaceLayout({
  base,
  eventId,
  children,
}: {
  base: '/admin' | '/leader';
  eventId: string;
  children: React.ReactNode;
}) {
  const scope = await requireEventScope(eventId);
  const { locale, t } = await getT();
  const event = await getEventOr404(eventId);
  if (!event) notFound();

  return (
    <AppShell
      user={scope.user}
      homeHref={base}
      sections={eventNav(t, base, eventId, scope.canManage)}
      contextTitle={event.name}
      contextSubtitle={`${formatDate(event.date, locale)} · ${formatTime(event.startTime, locale)}`}
    >
      <nav className="op-crumbs mb-3 flex items-center gap-1.5 text-[12.5px] text-ink-500">
        <Link href={`${base}/events`} className="hover:text-ink-300">
          {base === '/admin' ? t.event.title : t.nav.myEvents}
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate text-ink-300">{event.name}</span>
      </nav>
      {children}
    </AppShell>
  );
}

/** Loads an event and the caller's scope, or 404s. Used by every page below. */
export async function loadEventPage(eventId: string): Promise<{
  scope: EventScope;
  event: NonNullable<Awaited<ReturnType<typeof getEventOr404>>>;
  locale: 'ar' | 'en';
  t: Awaited<ReturnType<typeof getT>>['t'];
}> {
  const scope = await requireEventScope(eventId);
  const event = await getEventOr404(eventId);
  if (!event) notFound();
  const { locale, t } = await getT();
  return { scope, event, locale, t };
}

export function eventTypeLabel(t: Awaited<ReturnType<typeof getT>>['t'], type: string) {
  return t.enums.eventType[type as EventType];
}

export function eventStatusLabel(t: Awaited<ReturnType<typeof getT>>['t'], status: string) {
  return t.enums.eventStatus[status as EventStatus];
}
