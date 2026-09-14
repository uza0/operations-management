import Link from 'next/link';

import { getT } from '@/lib/i18n/server';
import { requireUser } from '@/server/auth/rbac';
import { listEventsForUser } from '@/server/services/events';
import { PageHeader, Panel } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/states';
import { EventCard } from '@/components/event/EventCard';
import { IconCalendar } from '@/components/ui/icons';

/** The leader's event list — only events explicitly granted to them. */
export async function LeaderEventList({ title }: { title?: string }) {
  const user = await requireUser();
  const { locale, t } = await getT();
  const events = await listEventsForUser(user);

  return (
    <>
      <PageHeader title={title ?? t.nav.myEvents} subtitle={t.event.subtitle} />
      {events.length === 0 ? (
        <Panel bodyClassName="p-0">
          <EmptyState
            title={t.event.empty}
            hint={t.auth.unauthorizedHint}
            icon={<IconCalendar width={20} height={20} />}
          />
        </Panel>
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
      <p className="op-crumbs mt-4 text-[12.5px] text-ink-500">
        <Link href="/leader" className="hover:text-ink-300">
          {t.common.back}
        </Link>
      </p>
    </>
  );
}
