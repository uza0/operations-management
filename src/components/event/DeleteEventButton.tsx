'use client';

import { deleteEventAction } from '@/server/actions/events';
import { ConfirmSubmit } from '@/components/ui/client';
import { IconTrash } from '@/components/ui/icons';
import { format, type Dictionary } from '@/lib/i18n';

/**
 * Deletes an event and everything hanging off it.
 *
 * It lives on the card rather than inside the event because of what it is
 * for: clearing out the events made while trying the system. Going into each
 * one to find the button would mean ten visits to delete ten rehearsals.
 *
 * The confirmation names the event. "Are you sure?" is a question nobody
 * reads; the name of the thing about to disappear is one they do.
 */
export function DeleteEventButton({
  t,
  eventId,
  eventName,
}: {
  t: Dictionary;
  eventId: string;
  eventName: string;
}) {
  return (
    <form action={deleteEventAction}>
      <input type="hidden" name="eventId" value={eventId} />
      <ConfirmSubmit
        className="btn-ghost btn-sm text-crit-text"
        message={format(t.event.deleteConfirm, { name: eventName })}
      >
        <IconTrash width={14} height={14} />
        {t.common.delete}
      </ConfirmSubmit>
    </form>
  );
}
