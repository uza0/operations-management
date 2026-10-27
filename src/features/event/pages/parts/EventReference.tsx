'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { setEventReferenceAction } from '@/server/actions/events';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import type { Dictionary } from '@/lib/i18n';

/**
 * The company's own number for this event, typed where it is read.
 *
 * On its own rather than inside the event form, because it arrives on its own
 * schedule: sometimes with the booking, sometimes a fortnight after the night
 * is over and somebody is matching two systems against each other. Making
 * that a trip through the whole event form — name, venue, hours, all
 * revalidated — is how a reference ends up living in a WhatsApp message.
 *
 * It takes whatever shape the company issues. This system's job is to carry
 * it, not to have opinions about its format.
 */
export function EventReference({
  t,
  eventId,
  value,
}: {
  t: Dictionary;
  eventId: string;
  value: string | null;
}) {
  const router = useRouter();
  const [state, action] = useActionState(setEventReferenceAction, idle);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (state.status === 'success') {
      setEditing(false);
      router.refresh();
    }
  }, [state, router]);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p
          className="nums min-w-0 flex-1 truncate text-[15px] font-semibold text-ink-100"
          style={{ unicodeBidi: 'plaintext' }}
        >
          {value || (
            <span className="text-[13px] font-normal text-ink-500">
              {t.event.externalIdNone}
            </span>
          )}
        </p>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(true)}>
          {value ? t.common.edit : t.common.add}
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-2.5">
      <input type="hidden" name="eventId" value={eventId} />
      <input
        name="externalId"
        className="field nums"
        maxLength={60}
        autoFocus
        placeholder={t.event.externalIdPlaceholder}
        defaultValue={value ?? ''}
        style={{ unicodeBidi: 'plaintext' }}
      />
      <p className="text-[12px] leading-5 text-ink-500">{t.event.externalIdHint}</p>
      <FormError message={state.status === 'error' ? state.message : null} />
      <div className="flex gap-2">
        <SubmitButton className="btn-primary btn-sm" pendingLabel={t.common.saving}>
          {t.common.save}
        </SubmitButton>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(false)}>
          {t.common.cancel}
        </button>
      </div>
    </form>
  );
}
