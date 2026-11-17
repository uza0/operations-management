'use client';

import { useActionState, useEffect, useRef } from 'react';

import { postSurveyAction } from '@/server/actions/surveys';
import { idle } from '@/server/actions/types';
import { SubmitButton } from '@/components/ui/client';
import { FormError, Notice } from '@/components/ui/states';
import { format, type Dictionary } from '@/lib/i18n';

export function SurveyForm({ t }: { t: Dictionary }) {
  const [state, action] = useActionState(postSurveyAction, idle);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === 'success') form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="space-y-4">
      <div>
        <label className="field-label" htmlFor="sv-title">{t.surveys.name}</label>
        <input id="sv-title" name="title" className="field" required maxLength={160} placeholder={t.surveys.namePlaceholder} />
      </div>
      <div>
        <label className="field-label" htmlFor="sv-url">{t.surveys.url}</label>
        <input id="sv-url" name="url" type="url" dir="ltr" placeholder="https://" className="field" required />
        <p className="mt-1 text-[12px] text-ink-500">{t.surveys.urlHint}</p>
      </div>
      <div>
        <label className="field-label" htmlFor="sv-note">{t.surveys.note}</label>
        <textarea id="sv-note" name="note" rows={2} maxLength={600} className="field" />
      </div>
      <div>
        <label className="field-label" htmlFor="sv-days">{t.surveys.days}</label>
        <select id="sv-days" name="days" className="field" defaultValue="7">
          {[3, 7, 14, 30].map((n) => (
            <option key={n} value={n}>{format(t.surveys.daysN, { n })}</option>
          ))}
          <option value="0">{t.surveys.daysForever}</option>
        </select>
      </div>
      {state.status === 'error' ? <FormError message={state.message} /> : null}
      {state.status === 'success' ? <Notice tone="ok">{state.message}</Notice> : null}
      <div className="flex justify-end">
        <SubmitButton pendingLabel={t.common.saving}>{t.surveys.send}</SubmitButton>
      </div>
    </form>
  );
}
