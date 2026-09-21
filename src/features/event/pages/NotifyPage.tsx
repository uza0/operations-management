import { headers } from 'next/headers';
import QRCode from 'qrcode';

import { loadEventPage } from '@/features/event/workspace';
import { PageHeader } from '@/components/ui/panel';
import { redirect } from 'next/navigation';

import { buildBriefings } from '@/server/services/notify';

import { BriefingBoard } from './parts/BriefingBoard';

async function resolveBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, '');
  const store = await headers();
  const host = store.get('x-forwarded-host') ?? store.get('host') ?? 'localhost:3000';
  const proto = store.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

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
      boardToken: event.boardToken,
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
      />
    </>
  );
}
