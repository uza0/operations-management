import QRCode from 'qrcode';

import { loadEventPage } from '@/features/event/workspace';
import { PageHeader } from '@/components/ui/panel';
import { redirect } from 'next/navigation';

import { buildBriefings, resolveBaseUrl } from '@/server/services/notify';
import { readStatus } from '@/server/services/whatsapp';
import type { EventType } from '@/lib/constants';

import { BriefingBoard } from './parts/BriefingBoard';

/**
 * Briefing the team before an event.
 *
 * Only someone who can manage the event sees it: it exposes every member's
 * phone number and personal link in one place, which is exactly what a gate
 * leader must not have.
 */
export async function EventNotifyPage({ eventId }: { eventId: string }) {
  const { scope, event, locale, t } = await loadEventPage(eventId);
  if (!scope.canManage) redirect('/forbidden');

  const baseUrl = await resolveBaseUrl();
  const briefings = await buildBriefings({
    eventId,
    event: {
      name: event.name,
      date: event.date,
      teamArrivalTime: event.teamArrivalTime,
      type: event.type as EventType,
      boardToken: event.boardToken,
      // An event's own photo, or the venue's — the member's map page falls
      // back the same way, so the link is offered on the same condition.
      hasMap: Boolean(event.mapImageUrl ?? event.venue.mapImageUrl),
      venue: { name: event.venue.name, locationUrl: event.venue.locationUrl },
    },
    baseUrl,
    t,
    locale,
  });

  const rows = await Promise.all(
    briefings.map(async (b) => ({
      ...b,
      notifiedAtLabel: b.notifiedAt ? b.notifiedAt.toISOString() : null,
      qrDataUrl: await QRCode.toDataURL(b.memberUrl, {
        width: 320,
        margin: 1,
        color: { dark: '#0b0f14', light: '#ffffff' },
      }).catch(() => null),
    })),
  );

  return (
    <>
      <PageHeader title={t.notify.title} subtitle={t.notify.subtitle} />
      <BriefingBoard
        t={t}
        locale={locale}
        eventId={eventId}
        rows={rows}
        hasLocation={Boolean(event.venue.locationUrl)}
        api={readStatus()}
      />
    </>
  );
}
