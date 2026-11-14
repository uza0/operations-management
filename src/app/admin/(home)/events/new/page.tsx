import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventRequests, events, venues } from '@/db/schema';
import { requireRole } from '@/server/auth/rbac';
import { leadershipCandidates } from '@/server/services/access';
import { getT } from '@/lib/i18n/server';
import { PageHeader, Panel } from '@/components/ui/panel';
import { EmptyState, Notice } from '@/components/ui/states';
import { IconArrowRight, IconPin } from '@/components/ui/icons';

import { EventForm } from './EventForm';

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  await requireRole('ADMIN');
  const { t } = await getT();
  const { request: requestId } = await searchParams;

  /* Completing an evening the map editor filed: start from what he gave. */
  const filed = requestId
    ? await db.query.eventRequests.findFirst({ where: eq(eventRequests.id, requestId) })
    : null;
  const request = filed && filed.status === 'PENDING' ? filed : null;

  const [venueRows, leaderRows, templateRows] = await Promise.all([
    db.select({ id: venues.id, name: venues.name }).from(venues).orderBy(venues.name),
    /*
     * Everyone who can be put in charge, not only the accounts whose role says
     * TEAM_LEADER. A supervisor running Thursday's match himself is that
     * match's leader, and making him create a second account to say so is how
     * one person ends up with three passwords.
     */
    leadershipCandidates(),
    /*
     * Any event already planned can serve as the template — newest first,
     * because the one you want is almost always the last one you ran.
     */
    db
      .select({
        id: events.id,
        name: events.name,
        date: events.date,
        venueName: venues.name,
      })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .orderBy(desc(events.date))
      .limit(30),
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
            <Notice tone="info">{request ? t.mapDesk.fromRequest : t.event.emptyHint}</Notice>
            <div className="mt-4">
              <EventForm
                t={t}
                venues={venueRows}
                leaders={leaderRows}
                templates={templateRows}
                mode="create"
                requestId={request?.id}
                values={
                  request
                    ? {
                        name: request.name,
                        venueId: request.venueId ?? undefined,
                        date: request.date ?? undefined,
                      }
                    : undefined
                }
              />
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
