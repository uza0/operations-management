import { db } from '@/db';
import { venues } from '@/db/schema';
import { loadManagedEventPage } from '@/features/event/workspace';
import { eventTeamLeaderIds, leadershipCandidates } from '@/server/services/access';
import { PageHeader, Panel } from '@/components/ui/panel';
import { Notice } from '@/components/ui/states';
import { EventForm } from '@/app/admin/(home)/events/new/EventForm';

/**
 * Changing an event after it exists.
 *
 * The times move: a kick-off is announced, the company moves it by an hour,
 * and until now there was no way to say so — the event was fixed at the
 * moment it was created and every later correction lived in a phone call.
 *
 * Moving the team's hours moves the team with them, but only the people who
 * were following the event's own hours in the first place. Somebody given a
 * time of their own was given it on purpose, and that decision survives. The
 * rule is in updateEventAction, beside the code that applies it.
 */
export async function EditEventPage({ eventId }: { eventId: string }) {
  const { event, t } = await loadManagedEventPage(eventId);
  const [venueRows, leaders, leaderIds] = await Promise.all([
    db.select({ id: venues.id, name: venues.name }).from(venues).orderBy(venues.name),
    leadershipCandidates(),
    eventTeamLeaderIds(eventId),
  ]);

  return (
    <>
      <PageHeader title={t.event.editEvent} subtitle={t.event.editEventHint} />
      <div className="max-w-2xl">
        <Panel bodyClassName="p-5">
          {/*
            Said before the form rather than after the save: a supervisor
            moving the arrival time by an hour is moving forty people, and he
            should know that before he presses the button, not from a toast
            afterwards.
          */}
          <Notice tone="info">{t.event.editEventHint}</Notice>
          <div className="mt-4">
            <EventForm
              t={t}
              venues={venueRows}
              leaders={leaders}
              mode="edit"
              values={{
                id: event.id,
                name: event.name,
                type: event.type,
                venueId: event.venueId,
                date: event.date,
                startTime: event.startTime,
                teamArrivalTime: event.teamArrivalTime,
                teamDepartureTime: event.teamDepartureTime,
                description: event.description,
                externalId: event.externalId,
                leaderIds,
              }}
            />
          </div>
        </Panel>
      </div>
    </>
  );
}
