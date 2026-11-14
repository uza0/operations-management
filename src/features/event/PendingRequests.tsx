import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventRequests, venues } from '@/db/schema';
import type { Dictionary } from '@/lib/i18n';
import { formatDate } from '@/lib/time';
import { ConfirmSubmit } from '@/components/ui/client';
import { dismissEventRequestAction } from '@/server/actions/event-requests';

/**
 * Evenings the map editor has filed and nobody has made an event of yet.
 * Shown to the admin only, and only when there are some.
 */
export async function PendingRequests({ t, locale }: { t: Dictionary; locale: 'ar' | 'en' }) {
  const rows = await db
    .select({
      id: eventRequests.id,
      name: eventRequests.name,
      seatsUrl: eventRequests.seatsUrl,
      date: eventRequests.date,
      venueName: venues.name,
      by: eventRequests.createdByName,
    })
    .from(eventRequests)
    .leftJoin(venues, eq(eventRequests.venueId, venues.id))
    .where(eq(eventRequests.status, 'PENDING'))
    .orderBy(desc(eventRequests.createdAt));

  if (rows.length === 0) return null;

  return (
    <section className="panel mb-4 border-warn/40">
      <header className="panel-head">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink-100">
            {t.mapDesk.pendingTitle} <span className="nums text-warn-text">({rows.length})</span>
          </h2>
          <p className="mt-0.5 text-[12.5px] text-ink-400">{t.mapDesk.pendingHint}</p>
        </div>
      </header>
      <ul className="divide-y divide-ink-800">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold text-ink-100">{row.name}</p>
              <p className="mt-0.5 text-[12.5px] text-ink-400">
                {[row.date ? formatDate(row.date, locale) : null, row.venueName, `${t.mapDesk.by} ${row.by}`]
                  .filter(Boolean)
                  .join(' · ')}
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
            <div className="flex shrink-0 items-center gap-2">
              <form action={dismissEventRequestAction}>
                <input type="hidden" name="requestId" value={row.id} />
                <ConfirmSubmit className="btn-ghost btn-sm" message={t.mapDesk.dismissConfirm}>
                  {t.mapDesk.dismiss}
                </ConfirmSubmit>
              </form>
              <Link href={`/admin/events/new?request=${row.id}`} className="btn-primary btn-sm">
                {t.mapDesk.complete}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
