import { loadManagedEventPage } from '@/features/event/workspace';
import { buildSeatSetup, dayBefore } from '@/server/services/seat-setup';
import { PageHeader, Panel } from '@/components/ui/panel';
import { SeatSetupManager } from './parts/SeatSetupManager';

/**
 * The chair-setting shift: its own day, its own crew, its own flat rate.
 *
 * Management-only, like every other screen that prints what somebody is owed.
 */
export async function EventSeatSetupPage({ eventId }: { eventId: string }) {
  const { event, locale, t } = await loadManagedEventPage(eventId);
  const data = await buildSeatSetup(eventId);

  return (
    <>
      <PageHeader title={t.seatSetup.title} subtitle={t.seatSetup.subtitle} />
      <Panel bodyClassName="p-0">
        <SeatSetupManager
          t={t}
          locale={locale}
          eventId={eventId}
          data={data}
          defaultDate={dayBefore(event.date)}
        />
      </Panel>
    </>
  );
}
