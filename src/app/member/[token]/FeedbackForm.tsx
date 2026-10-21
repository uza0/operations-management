'use client';

import { useActionState, useState } from 'react';

import { submitFeedbackAction } from '@/server/actions/member';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import type { Dictionary } from '@/lib/i18n';

/**
 * The member's verdict on the event, asked once it is over.
 *
 * The rating is five big buttons rather than a dropdown or a row of stars:
 * this is filled in on a phone, often standing up, by someone who has been on
 * their feet for eight hours. One tap should be enough to say something, and
 * the three text boxes under it are all optional for the same reason — a
 * rating with no words is still worth having, and demanding an essay is how
 * you end up with no answers at all.
 */
export function FeedbackForm({
  t,
  token,
  existing,
}: {
  t: Dictionary;
  token: string;
  existing: {
    rating: number;
    wentWell: string | null;
    problems: string | null;
    suggestions: string | null;
  } | null;
}) {
  const [state, action] = useActionState(submitFeedbackAction, idle);
  const [rating, setRating] = useState(existing?.rating ?? 0);

  const sent = state.status === 'success';

  return (
    <section className="panel p-4">
      <h2 className="text-[15px] font-semibold text-ink-100">{t.feedback.title}</h2>
      <p className="mt-1 text-[12.5px] leading-5 text-ink-500">{t.feedback.subtitle}</p>

      {sent ? (
        <p className="mt-3 rounded-lg border border-ok/40 bg-ok/10 px-3 py-2.5 text-[13.5px] text-ok-text">
          {state.message ?? t.feedback.thanks}
        </p>
      ) : null}

      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="rating" value={rating} />

        <div>
          <p className="field-label">{t.feedback.rating}</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                aria-pressed={rating === value}
                className={`nums h-12 flex-1 rounded-lg border text-[17px] font-bold transition ${
                  rating === value
                    ? 'border-brand-500 bg-brand-500/20 text-brand-200'
                    : 'border-ink-700 bg-ink-900 text-ink-400'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11.5px] text-ink-600">
            <span>{t.feedback.scale1}</span>
            <span>{t.feedback.scale5}</span>
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="fb-well">
            {t.feedback.wentWell} <span className="text-ink-500">({t.feedback.optional})</span>
          </label>
          <textarea
            id="fb-well"
            name="wentWell"
            rows={2}
            className="field"
            defaultValue={existing?.wentWell ?? ''}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="fb-problems">
            {t.feedback.problems} <span className="text-ink-500">({t.feedback.optional})</span>
          </label>
          <textarea
            id="fb-problems"
            name="problems"
            rows={3}
            className="field"
            defaultValue={existing?.problems ?? ''}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="fb-suggestions">
            {t.feedback.suggestions} <span className="text-ink-500">({t.feedback.optional})</span>
          </label>
          <textarea
            id="fb-suggestions"
            name="suggestions"
            rows={2}
            className="field"
            defaultValue={existing?.suggestions ?? ''}
          />
        </div>

        <FormError message={state.status === 'error' ? state.message : null} />

        <SubmitButton
          className="btn-primary w-full justify-center py-3 text-[15px]"
          disabled={rating === 0}
          pendingLabel={t.common.saving}
        >
          {existing ? t.feedback.update : t.feedback.submit}
        </SubmitButton>
      </form>
    </section>
  );
}
