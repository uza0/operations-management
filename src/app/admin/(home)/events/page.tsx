import Link from 'next/link';

import { requireRole } from '@/server/auth/rbac';
import { getT } from '@/lib/i18n/server';
import { listEventsForUser } from '@/server/services/events';
import { PageHeader, Panel } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/states';
import { EventCard } from '@/components/event/EventCard';
import { TypeLegend } from '@/components/event/TypeLegend';
import { DeleteEventButton } from '@/components/event/DeleteEventButton';
import { IconCalendar, IconPlus } from '@/components/ui/icons';
import { EVENT_STATUSES, type EventStatus } from '@/lib/constants';

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const user = await requireRole('ADMIN');
  const { locale, t } = await getT();
  const params = await searchParams;

  const all = await listEventsForUser(user);
  const status = params.status ?? '';
  const q = (params.q ?? '').trim().toLowerCase();

  const filtered = all.filter(
    (e) =>
      (!status || e.status === status) &&
      (!q || e.name.toLowerCase().includes(q) || e.venueName.toLowerCase().includes(q)),
  );

  return (
    <>
      <PageHeader
        title={t.event.title}
        subtitle={t.event.subtitle}
        action={
          <Link href="/admin/events/new" className="btn-primary">
            <IconPlus width={16} height={16} />
            {t.event.newEvent}
          </Link>
        }
      />

      <form className="mb-4 flex flex-wrap items-end gap-2" action="/admin/events">
        <div className="min-w-[200px] flex-1">
          <label className="field-label" htmlFor="q">
            {t.common.search}
          </label>
          <input id="q" name="q" defaultValue={params.q ?? ''} className="field" />
        </div>
        <div className="w-[180px]">
          <label className="field-label" htmlFor="status">
            {t.event.status}
          </label>
          <select id="status" name="status" defaultValue={status} className="field">
            <option value="">{t.common.all}</option>
            {EVENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t.enums.eventStatus[s as EventStatus]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          {t.common.apply}
        </button>
      </form>

      {filtered.length === 0 ? (
        <Panel bodyClassName="p-0">
          <EmptyState
            title={all.length ? t.common.noResults : t.event.empty}
            hint={all.length ? undefined : t.event.emptyHint}
            icon={<IconCalendar width={20} height={20} />}
            action={
              all.length ? null : (
                <Link href="/admin/events/new" className="btn-primary btn-sm">
                  <IconPlus width={15} height={15} />
                  {t.event.newEvent}
                </Link>
              )
            }
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              t={t}
              locale={locale}
              href={`/admin/events/${event.id}`}
              action={
                <DeleteEventButton t={t} eventId={event.id} eventName={event.name} />
              }
            />
          ))}
        </div>
      )}

      {filtered.length ? <TypeLegend t={t} /> : null}
    </>
  );
}
