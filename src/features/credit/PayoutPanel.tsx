'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import Link from 'next/link';

import { reversePayoutAction } from '@/server/actions/payroll';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { ConfirmSubmit } from '@/components/ui/client';
import { formatAmount } from '@/lib/money';
import { format, type Dictionary, type Locale } from '@/lib/i18n';
import { formatDate } from '@/lib/time';

export type PayoutRow = {
  id: string;
  fromDate: string;
  toDate: string;
  totalAmount: number;
  peopleCount: number;
  note: string | null;
  createdByName: string;
  createdAt: Date;
};

/**
 * Recording that wages went out, and the record of the ones that already did.
 *
 * The span is typed rather than guessed, because the company's spans do not
 * line up with months: four events over a fortnight, handed over in one go.
 * What falls outside stays owed by doing nothing at all, which is the whole
 * behaviour — a man who worked the twentieth when the handover ran to the
 * nineteenth keeps his twentieth.
 */
export function PayoutPanel({
  t,
  locale,
  from,
  to,
  owedTotal,
  owedPeople,
  payouts,
}: {
  t: Dictionary;
  locale: Locale;
  from?: string;
  to?: string;
  owedTotal: number;
  owedPeople: number;
  payouts: PayoutRow[];
}) {
  const router = useRouter();
  const [reverseState, reverse] = useActionState(reversePayoutAction, idle);

  useEffect(() => {
    if (reverseState.status === 'success') router.refresh();
  }, [reverseState, router]);

  const ready = Boolean(from && to);

  return (
    <section className="panel mt-4 p-4">
      <h2 className="text-[15px] font-semibold text-ink-100">{t.credit.payoutTitle}</h2>
      <p className="mt-1 text-[12.5px] leading-5 text-ink-500">{t.credit.payoutHint}</p>

      <div className="mt-3 rounded-card border border-ink-700 bg-ink-850 p-3">
        {/*
          The figure, and the way to the one place it is paid from.

          There used to be a button here that marked the span as handed over.
          It wrote the same record the payment file writes, without making a
          file — so a span settled here by a slip of the hand was quietly
          missing from the next file the company was sent, and those people
          were not paid. Nothing is handed over in cash, so nothing needs a
          second door: the file is the handover.
        */}
        {ready ? (
          <p className="text-[13px] text-ink-300">
            {t.credit.payoutPreview}
            <span className="mx-1.5 text-ink-600">·</span>
            <span className="nums font-semibold text-ink-100">
              {formatAmount(owedTotal)} {t.credit.currency}
            </span>
            <span className="mx-1.5 text-ink-600">·</span>
            <span className="nums">{format(t.credit.payoutPeople, { n: owedPeople })}</span>
          </p>
        ) : null}
        <p className="mt-1 text-[12px] leading-5 text-ink-500">{t.credit.payoutViaFile}</p>
        <Link
          href={ready ? `/admin/payments?from=${from}&to=${to}` : '/admin/payments'}
          className="btn-primary btn-sm mt-2.5 inline-flex"
        >
          {t.payment.nav}
        </Link>
      </div>

      <h3 className="mt-4 text-[13.5px] font-semibold text-ink-200">
        {t.credit.payoutHistory}
      </h3>
      {payouts.length === 0 ? (
        <p className="mt-1 text-[12.5px] text-ink-500">{t.credit.payoutEmpty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-ink-800">
          {payouts.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="nums text-[13.5px] font-medium text-ink-100">
                  {formatDate(row.fromDate, locale)} → {formatDate(row.toDate, locale)}
                </p>
                <p className="mt-0.5 text-[12px] text-ink-500">
                  <span className="nums">{formatAmount(row.totalAmount)}</span>{' '}
                  {t.credit.currency}
                  <span className="mx-1.5 text-ink-600">·</span>
                  <span className="nums">
                    {format(t.credit.payoutPeople, { n: row.peopleCount })}
                  </span>
                  <span className="mx-1.5 text-ink-600">·</span>
                  <span style={{ unicodeBidi: 'plaintext' }}>{row.createdByName}</span>
                </p>
                {row.note ? (
                  <p className="mt-0.5 text-[12px] text-ink-500">{row.note}</p>
                ) : null}
              </div>
              <form action={reverse}>
                <input type="hidden" name="payoutId" value={row.id} />
                <ConfirmSubmit
                  className="btn-ghost btn-sm text-crit-text"
                  message={t.credit.payoutReverseConfirm}
                >
                  {t.credit.payoutReverse}
                </ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
      )}
      <FormError message={reverseState.status === 'error' ? reverseState.message : null} />
    </section>
  );
}
