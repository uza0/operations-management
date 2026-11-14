import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventRequests, venues } from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { requireRole } from '@/server/auth/rbac';
import { PageHeader, Panel } from '@/components/ui/panel';
import { Badge } from '@/components/ui/status';
import { ConfirmSubmit } from '@/components/ui/client';
import { withdrawEventRequestAction } from '@/server/actions/event-requests';
import { formatDate } from '@/lib/time';

import { RequestForm } from './RequestForm';

export const dynamic = 'force-dynamic';

export default async function MapDeskPage() {
  const user = await requireRole('MAP_EDITOR');
  const { t, locale } = await getT();

  const [venueRows, mine] = await Promise.all([
    db.select({ id: venues.id, name: venues.name }).from(venues).orderBy(venues.name),
    // His own, and only his own.
    db
      .select({
        id: eventRequests.id,
        name: eventRequests.name,
        seatsUrl: eventRequests.seatsUrl,
        date: eventRequests.date,
        status: eventRequests.status,
        venueName: venues.name,
        createdAt: eventRequests.createdAt,
      })
      .from(eventRequests)
      .leftJoin(venues, eq(eventRequests.venueId, venues.id))
      .where(eq(eventRequests.createdById, user.id))
      .orderBy(desc(eventRequests.createdAt))
      .limit(50),
  ]);

  const tone = { PENDING: 'warn', CREATED: 'ok', DISMISSED: 'neutral' } as const;

  return (
    <>
      <PageHeader title={t.mapDesk.title} subtitle={t.mapDesk.subtitle} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel bodyClassName="p-5">
          <RequestForm t={t} venues={venueRows} />
        </Panel>

        <Panel title={t.mapDesk.mine} bodyClassName="p-0">
          {mine.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13.5px] text-ink-500">{t.mapDesk.mineEmpty}</p>
          ) : (
            <ul className="divide-y divide-ink-800">
              {mine.map((row) => (
                <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-100">{row.name}</p>
                    <p className="mt-0.5 text-[12.5px] text-ink-400">
                      {[row.date ? formatDate(row.date, locale) : null, row.venueName]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                    <a
                      href={row.seatsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-[12.5px] text-brand-300 hover:underline"
                    >
                      {t.mapDesk.openMap}
                    </a>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge tone={tone[row.status as keyof typeof tone] ?? 'neutral'}>
                      {t.mapDesk[`status${row.status}` as 'statusPENDING'] ?? row.status}
                    </Badge>
                    {row.status === 'PENDING' ? (
                      <form action={withdrawEventRequestAction}>
                        <input type="hidden" name="requestId" value={row.id} />
                        <ConfirmSubmit className="btn-ghost btn-sm" message={t.mapDesk.withdrawConfirm}>
                          {t.mapDesk.withdraw}
                        </ConfirmSubmit>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
