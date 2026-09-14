import Link from 'next/link';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { users, venues } from '@/db/schema';
import { requireRole } from '@/server/auth/rbac';
import { getT } from '@/lib/i18n/server';
import { PageHeader, Panel } from '@/components/ui/panel';
import { EmptyState, Notice } from '@/components/ui/states';
import { IconArrowRight, IconPin } from '@/components/ui/icons';

import { EventForm } from './EventForm';

export default async function NewEventPage() {
  await requireRole('ADMIN');
  const { t } = await getT();

  const [venueRows, leaderRows] = await Promise.all([
    db.select({ id: venues.id, name: venues.name }).from(venues).orderBy(venues.name),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.role, 'TEAM_LEADER')),
  ]);

  return (
    <>
      <PageHeader
        title={t.event.newEvent}
        subtitle={t.event.subtitle}
        breadcrumb={
          <Link
            href="/admin/events"
            className="-my-2.5 inline-flex min-h-[44px] items-center gap-1.5 py-2.5 text-[12.5px] text-ink-400 hover:text-ink-200"
          >
            <IconArrowRight width={14} height={14} className="rtl:rotate-180" />
            {t.event.title}
          </Link>
        }
      />

      <div className="max-w-2xl">
        {venueRows.length === 0 ? (
          <Panel bodyClassName="p-0">
            <EmptyState
              title={t.venue.empty}
              hint={t.venue.emptyHint}
              icon={<IconPin width={20} height={20} />}
              action={
                <Link href="/admin/venues" className="btn-primary btn-sm">
                  {t.venue.newVenue}
                </Link>
              }
            />
          </Panel>
        ) : (
          <Panel bodyClassName="p-5">
            <Notice tone="info">{t.event.emptyHint}</Notice>
            <div className="mt-4">
              <EventForm t={t} venues={venueRows} leaders={leaderRows} mode="create" />
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
