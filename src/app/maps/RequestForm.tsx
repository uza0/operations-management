'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { submitEventRequestAction } from '@/server/actions/event-requests';
import { idle } from '@/server/actions/types';
import { SubmitButton } from '@/components/ui/client';
import { FormError, Notice } from '@/components/ui/states';
import type { Dictionary } from '@/lib/i18n';

/**
 * Two fields are the job. The rest sits behind "more details", closed, so the
 * form says plainly what is asked of him and what is only welcome.
 */
export function RequestForm({ t, venues }: { t: Dictionary; venues: { id: string; name: string }[] }) {
  const [state, action] = useActionState(submitEventRequestAction, idle);
  const [more, setMore] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') {
      form.current?.reset();
      setMore(false);
    }
  }, [state]);

  return (
    <form ref={form} action={action} className="space-y-4">
      <div>
        <label className="field-label" htmlFor="req-name">{t.mapDesk.name}</label>
        <input id="req-name" name="name" className="field" required maxLength={160} />
      </div>
      <div>
        <label className="field-label" htmlFor="req-url">{t.mapDesk.seatsUrl}</label>
        <input
          id="req-url"
          name="seatsUrl"
          type="url"
          inputMode="url"
          dir="ltr"
          placeholder="https://"
          className="field"
          required
        />
        <p className="mt-1 text-[12px] text-ink-500">{t.mapDesk.seatsHint}</p>
      </div>

      <div className="rounded-control border border-ink-700">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2.5 text-start text-[13.5px] font-semibold text-ink-200"
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
        >
          <span>{t.mapDesk.more}</span>
          <span className="text-ink-500">{more ? '−' : '+'}</span>
        </button>
        {/* Kept in the form when closed, so a value typed and then hidden still goes. */}
        <div className={more ? 'space-y-3 border-t border-ink-700 p-3' : 'hidden'}>
          <p className="text-[12px] text-ink-500">{t.mapDesk.moreHint}</p>
          <div>
            <label className="field-label" htmlFor="req-date">{t.mapDesk.date}</label>
            <input id="req-date" name="date" type="date" className="field nums" />
          </div>
          <div>
            <label className="field-label" htmlFor="req-venue">{t.mapDesk.venue}</label>
            <select id="req-venue" name="venueId" className="field" defaultValue="">
              <option value="">{t.mapDesk.venueNone}</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>{venue.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {state.status === 'error' ? <FormError message={state.message} /> : null}
      {state.status === 'success' ? <Notice tone="ok">{state.message}</Notice> : null}

      <div className="flex justify-end">
        <SubmitButton pendingLabel={t.common.saving}>{t.mapDesk.submit}</SubmitButton>
      </div>
    </form>
  );
}
