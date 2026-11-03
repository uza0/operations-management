'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { reversePayoutAction } from '@/server/actions/payroll';
import { idle } from '@/server/actions/types';
import { ConfirmSubmit } from '@/components/ui/client';
import { EmptyState, FormError } from '@/components/ui/states';
import { formatAmount } from '@/lib/money';
import { formatDateTime } from '@/lib/time';
import type { Dictionary, Locale } from '@/lib/i18n';

type Row = {
  id: string;
  fromDate: string;
  toDate: string;
  totalAmount: number;
  expensesTotal: number;
  rowCount: number;
  peopleCount: number;
  fileName: string | null;
  note: string | null;
  createdByName: string;
  createdAt: Date;
};

/**
 * What has actually been sent, with the file itself on every line.
 *
 * The file is served from what was stored, not rebuilt: rates and rosters
 * move, and a file regenerated a month later would not be the one the company
 * paid from. Reversing one puts its lines back to owed and leaves both the
 * handover and the reversal in the log.
 */
export function HandoverList({
  t,
  locale,
  rows,
}: {
  t: Dictionary;
  locale: Locale;
  rows: Row[];
}) {
  if (rows.length === 0) {
    return <EmptyState title={t.payment.historyEmpty} hint={t.payment.historyHint} />;
  }
  return (
    <ul className="divide-y divide-ink-800">
      {rows.map((row) => (
        <HandoverRow key={row.id} t={t} locale={locale} row={row} />
      ))}
    </ul>
  );
}

function HandoverRow({ t, locale, row }: { t: Dictionary; locale: Locale; row: Row }) {
  const router = useRouter();
  const [state, reverse] = useActionState(reversePayoutAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">
        <p className="nums text-[14.5px] font-semibold text-ink-100">
          {row.fromDate} → {row.toDate}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-500">
          <span style={{ unicodeBidi: 'plaintext' }}>{row.createdByName}</span>
          <span aria-hidden className="text-ink-600">·</span>
          <span className="nums">{formatDateTime(row.createdAt, locale)}</span>
          {row.rowCount ? (
            <>
              <span aria-hidden className="text-ink-600">·</span>
              <span className="nums">
                {row.rowCount} {t.payment.rows} · {row.peopleCount} {t.payment.people}
              </span>
            </>
          ) : null}
          {row.note ? (
            <>
              <span aria-hidden className="text-ink-600">·</span>
              <span>{row.note}</span>
            </>
          ) : null}
        </p>
      </div>

      <div className="nums shrink-0 text-end">
        <p className="text-[15px] font-bold text-ink-100">
          {formatAmount(row.totalAmount)} {t.credit.currency}
        </p>
        {row.expensesTotal ? (
          <p className="text-[12px] text-ink-500">
            + {formatAmount(row.expensesTotal)} {t.payment.costs}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {row.fileName ? (
          <a className="btn-ghost btn-sm" href={`/api/payments/${row.id}`}>
            {t.payment.download}
          </a>
        ) : null}
        <form action={reverse}>
          <input type="hidden" name="payoutId" value={row.id} />
          <ConfirmSubmit
            className="btn-ghost btn-sm text-crit-text"
            message={t.payment.reverseConfirm}
          >
            {t.payment.reverse}
          </ConfirmSubmit>
        </form>
      </div>
      {state.status === 'error' ? <FormError message={state.message} /> : null}
    </li>
  );
}
