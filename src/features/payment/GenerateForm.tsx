'use client';

import { useActionState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { generatePaymentFileAction } from '@/server/actions/payment-file';
import { idle } from '@/server/actions/types';
import { FormError, Notice } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import type { Dictionary } from '@/lib/i18n';

/**
 * The dates, and the one button.
 *
 * Pressing it is the handover: the file is built and the week's lines are
 * marked as gone out, in the same act, because a file that leaves without the
 * mark is money that gets sent twice and a mark without a file is money that
 * never left. It is refused while anything in the week would be unpayable.
 */
export function GenerateForm({
  base,
  t,
  range,
  disabled,
}: {
  base: '/admin' | '/leader';
  t: Dictionary;
  range: { from: string; to: string };
  disabled: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [state, action] = useActionState(generatePaymentFileAction, idle);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  function apply() {
    const next = new URLSearchParams(params.toString());
    next.set('from', from);
    next.set('to', to);
    router.push(`${base}/payments?${next}`);
  }

  return (
    <form action={action} className="panel p-4">
      <input type="hidden" name="fromDate" value={range.from} />
      <input type="hidden" name="toDate" value={range.to} />

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="label">{t.credit.from}</span>
          <input
            type="date"
            className="field nums"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">{t.credit.to}</span>
          <input
            type="date"
            className="field nums"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button type="button" className="btn-ghost btn-sm" onClick={apply}>
          {t.credit.apply}
        </button>
        <span className="flex-1" />
        <SubmitButton
          className="btn-primary"
          pendingLabel={t.payment.generating}
          disabled={disabled || from !== range.from || to !== range.to}
        >
          {t.payment.generate}
        </SubmitButton>
      </div>

      {state.status === 'success' ? (
        <div className="mt-3">
          <Notice tone="ok">{t.payment.generated}</Notice>
        </div>
      ) : null}
      <FormError message={state.status === 'error' ? state.message : null} />
    </form>
  );
}
