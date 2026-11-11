import Link from 'next/link';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { eventAccess, teamMembers } from '@/db/schema';
import { requireRole } from '@/server/auth/rbac';
import { getT } from '@/lib/i18n/server';
import { listEventsForUser } from '@/server/services/events';
import { listRecentAudit } from '@/server/services/audit';
import { PageHeader, Panel, StatTile } from '@/components/ui/panel';
import { EmptyState, Notice } from '@/components/ui/states';
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
import { formatDate, formatDateTime, todayISO } from '@/lib/time';
import { advanceEvents, needsClosing, overdueToReady } from '@/server/services/lifecycle';
import { sweepInBackground } from '@/server/services/push';
import { format } from '@/lib/i18n';
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
  const leaderGrants = allEvents.length
    ? await db
        .select({ eventId: eventAccess.eventId })
        .from(eventAccess)
        .where(
          and(
            inArray(eventAccess.eventId, allEvents.map((event) => event.id)),
            eq(eventAccess.role, 'TEAM_LEADER'),
            isNull(eventAccess.gateId),
          ),
        )
    : [];
  const eventsWithLeader = new Set(leaderGrants.map((grant) => grant.eventId));
  /*
   * Two things the clock has already decided, placed first because both are
   * money standing still: an evening nobody closed, and an evening whose
   * crew was due and which was never sent to them at all. The second is the
   * one the system deliberately refuses to fix by itself.
   */
  /*
   * The sweep used to depend on a promoter opening his page, which on a
   * quiet day means nothing advances at all. The supervisor's own dashboard
   * drives it too — throttled, in the background, and never blocking the
   * page it is drawn on.
   */
  sweepInBackground(() => advanceEvents());

  const [unsentRows, unclosedRows] = await Promise.all([overdueToReady(), needsClosing()]);
  /* Only the ones this account can already see — the list is a shortcut, not a leak. */
  const byId = new Map(allEvents.map((event) => [event.id, event]));
  const unsent = unsentRows.map((row) => byId.get(row.id)).filter((e) => e !== undefined);
  const unclosed = unclosedRows.map((row) => byId.get(row.id)).filter((e) => e !== undefined);

  /*
   * Three days of a crew's money standing still is no longer an item in a
   * list. It sits at the top of the page until somebody marks the names.
   */
  const DAY = 24 * 60 * 60 * 1000;
  const stale = unclosedRows.filter((row) => Date.now() - (row.ended + row.grace) >= 3 * DAY);

  const attentionItems = [
    ...unsent.map((event) => ({
      key: `unsent-${event.id}`,
      event,
      href: `/admin/events/${event.id}`,
      title: t.dashboard.attentionNeverSent,
    })),
    ...unclosed.map((event) => ({
      key: `unclosed-${event.id}`,
      event,
      href: `/admin/events/${event.id}/attendance`,
      title: t.dashboard.attentionNeedsClosing,
    })),
    ...allEvents
      .filter((event) => event.openIssues > 0)
      .map((event) => ({
        key: `issues-${event.id}`,
        event,
        href: `/admin/events/${event.id}/issues`,
        title: format(t.dashboard.attentionOpenIssues, { n: event.openIssues }),
      })),
    ...allEvents
      .filter(
        (event) =>
          !eventsWithLeader.has(event.id) &&
          !['COMPLETED', 'ARCHIVED'].includes(event.status),
      )
      .map((event) => ({
        key: `leader-${event.id}`,
        event,
        href: `/admin/events/${event.id}/edit`,
        title: t.dashboard.attentionMissingLeader,
      })),
    ...upcoming
      .filter((event) => ['DRAFT', 'PLANNING'].includes(event.status))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((event) => ({
        key: `setup-${event.id}`,
        event,
        href: `/admin/events/${event.id}`,
        title: t.dashboard.attentionIncomplete,
      })),
  ].slice(0, 6);

  return (
    <>
      {stale.length > 0 ? (
        <div className="mb-4">
          <Notice tone="crit">{format(t.dashboard.closingBanner, { n: stale.length })}</Notice>
        </div>
      ) : null}

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

      <div className="mt-5">
        <Panel
          title={t.dashboard.attention}
          subtitle={t.dashboard.attentionHint}
          action={<Link href="/admin/events" className="btn-ghost btn-sm">{t.nav.events}</Link>}
          bodyClassName="p-0"
        >
          {attentionItems.length === 0 ? (
            <p className="px-4 py-5 text-[13.5px] text-ink-400">{t.dashboard.attentionEmpty}</p>
          ) : (
            <ul className="divide-y divide-ink-800">
              {attentionItems.map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className="flex min-h-[64px] items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-ink-850/60 sm:px-5">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-ink-100">{item.title}</span>
                      <span className="mt-1 block truncate text-[12.5px] text-ink-400">
                        {item.event.name} · {formatDate(item.event.date, locale)} · {item.event.venueName}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12.5px] font-semibold text-brand-300">{t.common.view}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
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
                    <p className="mt-1 text-[12.5px] text-ink-500">
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
