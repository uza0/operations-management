import Link from 'next/link';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { teamMembers } from '@/db/schema';
import { requireRole } from '@/server/auth/rbac';
import { getT } from '@/lib/i18n/server';
import { listEventsForUser } from '@/server/services/events';
import { listRecentAudit } from '@/server/services/audit';
import { PageHeader, Panel, StatTile } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/states';
import { EventCard } from '@/components/event/EventCard';
import {
  IconAlert,
  IconCalendar,
  IconPlus,
  IconUsers,
  IconCheckCircle,
  IconPin,
  IconTarget,
} from '@/components/ui/icons';
import { formatDateTime, todayISO } from '@/lib/time';
import type { AuditAction } from '@/lib/constants';

export default async function AdminDashboard() {
  const user = await requireRole('ADMIN');
  const { locale, t } = await getT();

  const [allEvents, memberCount, recentActivity] = await Promise.all([
    listEventsForUser(user),
    db.$count(teamMembers, eq(teamMembers.active, true)),
    listRecentAudit(8),
  ]);

  const today = todayISO();
  const live = allEvents.filter((e) => e.status === 'LIVE');
  const upcoming = allEvents.filter(
    (e) => ['DRAFT', 'PLANNING', 'READY'].includes(e.status) && e.date >= today,
  );
  const completed = allEvents.filter((e) =>
    ['COMPLETED', 'ARCHIVED'].includes(e.status),
  );
  const openIssues = allEvents.reduce((n, e) => n + e.openIssues, 0);

  return (
    <>
      <PageHeader
        title={t.dashboard.title}
        subtitle={t.dashboard.subtitle}
        action={
          <>
            <Link href="/admin/events/new" className="btn-primary">
              <IconPlus width={16} height={16} />
              {t.dashboard.createEvent}
            </Link>
            {live[0] ? (
              <Link href={`/admin/events/${live[0].id}`} className="btn-secondary">
                <IconTarget width={16} height={16} />
                {t.dashboard.openLiveEvent}
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatTile
          className="col-span-2 sm:col-span-1"
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
          label={t.dashboard.completedEvents}
          value={completed.length}
          icon={<IconCheckCircle width={16} height={16} />}
        />
        <StatTile
          label={t.dashboard.totalMembers}
          value={memberCount}
          icon={<IconUsers width={16} height={16} />}
        />
        <StatTile
          label={t.dashboard.openIssues}
          value={openIssues}
          tone={openIssues ? 'crit' : 'ok'}
          icon={<IconAlert width={16} height={16} />}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel
            title={t.dashboard.recentEvents}
            action={
              <Link href="/admin/events" className="btn-ghost btn-sm">
                {t.common.view}
              </Link>
            }
            bodyClassName="p-4 sm:p-5"
          >
            {allEvents.length === 0 ? (
              <EmptyState
                title={t.event.empty}
                hint={t.event.emptyHint}
                icon={<IconCalendar width={20} height={20} />}
                action={
                  <Link href="/admin/events/new" className="btn-primary btn-sm">
                    <IconPlus width={15} height={15} />
                    {t.dashboard.createEvent}
                  </Link>
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {allEvents.slice(0, 4).map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    t={t}
                    locale={locale}
                    href={`/admin/events/${event.id}`}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title={t.dashboard.quickActions} bodyClassName="p-3 sm:p-4">
            <div className="grid gap-2">
              <Link href="/admin/events/new" className="btn-secondary justify-start">
                <IconCalendar width={16} height={16} />
                {t.dashboard.createEvent}
              </Link>
              <Link href="/admin/venues" className="btn-secondary justify-start">
                <IconPin width={16} height={16} />
                {t.dashboard.createVenue}
              </Link>
              <Link href="/admin/team" className="btn-secondary justify-start">
                <IconUsers width={16} height={16} />
                {t.dashboard.addMember}
              </Link>
            </div>
          </Panel>

          <Panel title={t.dashboard.recentActivity} bodyClassName="p-0">
            {recentActivity.length === 0 ? (
              <EmptyState title={t.audit.empty} hint={t.audit.emptyHint} />
            ) : (
              <ul className="divide-y divide-ink-800">
                {recentActivity.map((row) => (
                  <li key={row.id} className="px-4 py-3">
                    <p className="text-[13.5px] leading-5 text-ink-200">{row.summary}</p>
                    <p className="mt-1 text-[11.5px] text-ink-500">
                      {t.enums.auditAction[row.action as AuditAction]} · {row.actorName} ·{' '}
                      <span className="nums">{formatDateTime(row.createdAt, locale)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
