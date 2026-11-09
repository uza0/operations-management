'use client';

import { useActionState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { generatePaymentFileAction } from '@/server/actions/payment-file';
import { idle } from '@/server/actions/types';
import { FormError, Notice } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import type { Dictionary } from '@/lib/i18n';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The dates, and the one button.
 *
 * Pressing it is the handover: the file is built and the week's lines are
 * marked as gone out, in the same act, because a file that leaves without the
 * mark is money that gets sent twice and a mark without a file is money that
 * never left. It is refused while anything in the week would be unpayable.
 *
 * A date picked here applies itself. It used to wait for a separate button,
 * which meant the two boxes could say one period while every figure under
 * them described another — the totals, the event count, the names of what was
 * unpayable — with nothing on the screen saying so. Somebody reads the names
 * of events he never asked about and concludes the system is wrong, and he is
 * right to: the screen was telling him two things at once.
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

  const apply = (nextFrom: string, nextTo: string) => {
    if (!DATE.test(nextFrom) || !DATE.test(nextTo)) return;
    if (nextFrom === range.from && nextTo === range.to) return;
    const next = new URLSearchParams(params.toString());
    next.set('from', nextFrom);
    next.set('to', nextTo);
    router.push(`${base}/payments?${next}`);
  };

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
            onChange={(e) => {
              setFrom(e.target.value);
              apply(e.target.value, to);
            }}
          />
        </label>
        <label className="block">
          <span className="label">{t.credit.to}</span>
          <input
            type="date"
            className="field nums"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              apply(from, e.target.value);
            }}
          />
        </label>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => apply(from, to)}
        >
          {t.credit.apply}
        </button>
        <span className="flex-1" />
        {/*
          Looking, and sending, as two different buttons.

          They were one act on purpose — a file that leaves without the mark
          pays everybody twice next week. But that left no way to read a
          week's wages before committing to them, which is not something
          anybody should send unseen. This one writes nothing at all.
        */}
        <a
          className="btn-ghost btn-sm"
          href={`/api/payments/preview?from=${range.from}&to=${range.to}`}
        >
          {t.payment.previewDownload}
        </a>
        <SubmitButton
          className="btn-primary"
          pendingLabel={t.payment.generating}
          disabled={disabled || from !== range.from || to !== range.to}
        >
          {t.payment.generate}
        </SubmitButton>
      </div>

      <p className="mt-2.5 text-[12px] leading-5 text-ink-500">{t.payment.previewHint}</p>

      {state.status === 'success' ? (
        <div className="mt-3">
          <Notice tone="ok">{t.payment.generated}</Notice>
        </div>
      ) : null}
      <FormError message={state.status === 'error' ? state.message : null} />
    </form>
  );
}
