import Link from 'next/link';

import { requireUser } from '@/server/auth/rbac';
import { getT } from '@/lib/i18n/server';
import { listEventsForUser } from '@/server/services/events';
import { PageHeader, Panel, StatTile, StatStrip } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/states';
import { EventCard } from '@/components/event/EventCard';
import { IconAlert, IconCalendar, IconTarget, IconUsers } from '@/components/ui/icons';
import { todayISO } from '@/lib/time';

export default async function LeaderDashboard() {
  const user = await requireUser();
  const { locale, t } = await getT();
  const events = await listEventsForUser(user);

  const today = todayISO();
  const live = events.filter((e) => e.status === 'LIVE');
  const upcoming = events.filter(
    (e) => ['DRAFT', 'PLANNING', 'READY'].includes(e.status) && e.date >= today,
  );
  const teamTotal = events.reduce((n, e) => n + e.teamSize, 0);
  const openIssues = events.reduce((n, e) => n + e.openIssues, 0);

  return (
    <>
      <PageHeader
        title={t.dashboard.title}
        subtitle={t.nav.leaderArea}
        action={
          live[0] ? (
            <Link href={`/leader/events/${live[0].id}`} className="btn-primary">
              <IconTarget width={16} height={16} />
              {t.dashboard.openLiveEvent}
            </Link>
          ) : null
        }
      />

      <StatStrip cols={4}>
        <StatTile
          label={t.dashboard.activeEvents}
          value={live.length}
          tone={live.length ? 'ok' : 'neutral'}
          hint={live.length ? live[0].name : t.dashboard.noLiveEvent}
          icon={<IconTarget width={16} height={16} />}
        />
        <StatTile
          label={t.dashboard.upcomingEvents}
          value={upcoming.length}
          icon={<IconCalendar width={16} height={16} />}
        />
        <StatTile
          label={t.dashboard.teamAssignments}
          value={teamTotal}
          icon={<IconUsers width={16} height={16} />}
        />
        <StatTile
          label={t.dashboard.openIssues}
          value={openIssues}
          tone={openIssues ? 'crit' : 'ok'}
          icon={<IconAlert width={16} height={16} />}
        />
      </StatStrip>

      <div className="mt-5">
        <Panel title={t.nav.myEvents} bodyClassName="p-4 sm:p-5">
          {events.length === 0 ? (
            <EmptyState
              title={t.event.empty}
              hint={t.auth.unauthorizedHint}
              icon={<IconCalendar width={20} height={20} />}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {events.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  t={t}
                  locale={locale}
                  href={`/leader/events/${event.id}`}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
