'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { setEventCreditDefaultAction } from '@/server/actions/operations';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import { format, type Dictionary } from '@/lib/i18n';
import { formatAmount } from '@/lib/money';

/**
 * What this event is worth, per person, before anyone is singled out.
 *
 * It sits on the attendance screen rather than in the event's settings because
 * this is where the supervisor is when the question comes up — a bigger night
 * pays more than the usual 30,000, and they are looking at the very list of
 * people it applies to.
 */
export function EventCreditDefault({
  t,
  eventId,
  value,
  totalPay,
}: {
  t: Dictionary;
  eventId: string;
  value: number;
  totalPay: number;
}) {
  const router = useRouter();
  const [state, action] = useActionState(setEventCreditDefaultAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <div className="panel mb-4 p-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="eventId" value={eventId} />
        <label className="block w-[170px]">
          <span className="label">
            {t.credit.eventDefault} <span className="text-ink-500">({t.credit.currency})</span>
          </span>
          <input
            type="number"
            name="payDefault"
            step="500"
            min="0"
            max="10000000"
            inputMode="numeric"
            className="field nums"
            defaultValue={value}
          />
        </label>
        <SubmitButton className="btn-primary btn-sm">{t.common.save}</SubmitButton>
        <p className="min-w-[200px] flex-1 text-[12.5px] leading-5 text-ink-500">
          {t.credit.eventDefaultHint}
          <span className="mt-1 block text-ink-300">
            {format(t.credit.eventTotal, { n: `${formatAmount(totalPay)} ${t.credit.currency}` })}
          </span>
        </p>
      </form>
      <FormError message={state.status === 'error' ? state.message : null} />
    </div>
  );
}
