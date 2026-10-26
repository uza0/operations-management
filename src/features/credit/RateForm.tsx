'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { setMemberRateAction } from '@/server/actions/payroll';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import { formatAmount } from '@/lib/money';
import type { Dictionary, Locale } from '@/lib/i18n';
import { formatDate } from '@/lib/time';

export type RateRow = {
  id: string;
  amount: number;
  effectiveFrom: string;
  note: string | null;
  createdByName: string;
};

/**
 * One person's rate, and the date it starts from.
 *
 * The date is the whole feature. "He is on fifty now" fixes the next event;
 * "he has been on fifty since the twelfth" fixes the three that have already
 * gone by at forty — and the second is the thing a supervisor actually needs
 * when an agreement was made in a corridor and written down a week later.
 *
 * What it will not reach is an event already handed over. That money is in
 * somebody's pocket, and a number that quietly disagrees with it is worse
 * than an underpayment somebody can see and correct.
 */
export function RateForm({
  t,
  locale,
  memberId,
  current,
  today,
  history,
}: {
  t: Dictionary;
  locale: Locale;
  memberId: string;
  current: number | null;
  today: string;
  history: RateRow[];
}) {
  const router = useRouter();
  const [state, action] = useActionState(setMemberRateAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <section className="panel p-4">
      <h2 className="text-[15px] font-semibold text-ink-100">{t.credit.rateTitle}</h2>

      <form action={action} className="mt-3 grid gap-3 sm:grid-cols-3">
        <input type="hidden" name="teamMemberId" value={memberId} />

        <div>
          <label className="field-label" htmlFor="rate-amount">
            {t.team.defaultPay}
          </label>
          <input
            id="rate-amount"
            name="amount"
            inputMode="numeric"
            className="field nums"
            defaultValue={current != null ? String(current) : ''}
            required
          />
        </div>

        <div>
          <label className="field-label" htmlFor="rate-from">
            {t.credit.rateFrom}
          </label>
          <input
            id="rate-from"
            name="effectiveFrom"
            type="date"
            className="field"
            defaultValue={today}
            required
          />
        </div>

        <div>
          <label className="field-label" htmlFor="rate-note">
            {t.credit.note}
          </label>
          <input id="rate-note" name="note" className="field" />
        </div>

        <div className="sm:col-span-3">
          <p className="text-[12px] leading-5 text-ink-500">{t.credit.rateFromHint}</p>
          <FormError message={state.status === 'error' ? state.message : null} />
          <SubmitButton className="btn-primary btn-sm mt-2">{t.credit.rateSave}</SubmitButton>
        </div>
      </form>

      {history.length > 0 ? (
        <>
          <h3 className="mt-4 text-[13px] font-semibold text-ink-200">
            {t.credit.rateHistory}
          </h3>
          <ul className="mt-1.5 space-y-1 text-[12.5px] text-ink-400">
            {history.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="nums font-semibold text-ink-200">
                  {formatAmount(row.amount)} {t.credit.currency}
                </span>
                <span className="nums">{formatDate(row.effectiveFrom, locale)}</span>
                <span className="text-ink-600">·</span>
                <span style={{ unicodeBidi: 'plaintext' }}>{row.createdByName}</span>
                {row.note ? <span className="text-ink-500">— {row.note}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
