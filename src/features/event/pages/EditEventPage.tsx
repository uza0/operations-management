import { db } from '@/db';
import { venues } from '@/db/schema';
import { loadManagedEventPage } from '@/features/event/workspace';
import { eventTeamLeaderId, eventTeamLeaderIds, leadershipCandidates } from '@/server/services/access';
import { PageHeader, Panel } from '@/components/ui/panel';
import { Notice } from '@/components/ui/states';
import { EventForm } from '@/app/admin/(home)/events/new/EventForm';
import { PosterUpload } from '@/features/event/pages/parts/PosterUpload';

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
  const [venueRows, leaders, leaderIds, primaryLeaderId] = await Promise.all([
    db.select({ id: venues.id, name: venues.name }).from(venues).orderBy(venues.name),
    leadershipCandidates(),
    eventTeamLeaderIds(eventId),
    eventTeamLeaderId(eventId),
  ]);

  return (
    <>
      <PageHeader title={t.event.editEvent} subtitle={t.event.editEventHint} />
      <div className="max-w-2xl space-y-4">
        <Panel bodyClassName="p-5">
          <h2 className="text-[15px] font-bold text-ink-100">{t.event.posterTitle}</h2>
          <p className="mb-4 mt-1 text-[12.5px] leading-5 text-ink-400">{t.event.posterHint}</p>
          <PosterUpload eventId={event.id} url={event.posterUrl ?? null} labels={{ upload: t.event.posterUpload, replace: t.event.posterReplace, remove: t.event.posterRemove, removeConfirm: t.event.posterRemoveConfirm, error: t.event.posterError, tooLarge: t.event.posterTooLarge, working: t.event.posterWorking }} />
        </Panel>
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
                partners: event.partners,
                dressCode: event.dressCode,
                primaryLeaderId,
                leaderIds: leaderIds.filter((id) => id !== primaryLeaderId),
              }}
            />
          </div>
        </Panel>
      </div>
    </>
  );
}
