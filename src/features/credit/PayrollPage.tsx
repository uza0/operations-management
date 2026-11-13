import Link from 'next/link';

import { getT } from '@/lib/i18n/server';
import { payrollLedger } from '@/server/services/credit';
import { PageHeader, StatTile, StatStrip } from '@/components/ui/panel';
import { formatDate, isValidDate } from '@/lib/time';
import { format } from '@/lib/i18n';

import { db } from '@/db';
import { payouts as payoutsTable } from '@/db/schema';
import { desc } from 'drizzle-orm';

import { PayoutPanel } from './PayoutPanel';
import { RangeForm } from './RangeForm';
import { formatAmount, formatMoney } from '@/lib/money';

/**
 * The sheet the company actually pays from.
 *
 * Its job is to be checkable: every person's total sits beside the events it
 * came from, so a question about one number can be settled without opening the
 * system. Only finished events count — an event still running has attendance
 * that is still being written, and paying against it would mean paying twice
 * when it is corrected.
 */
export async function PayrollPage({
  base = '/admin',
  from,
  to,
}: {
  base?: '/admin' | '/leader';
  from?: string;
  to?: string;
}) {
  const { locale, t } = await getT();

  // A half-typed date in the URL should narrow nothing rather than everything.
  const range = {
    from: from && isValidDate(from) ? from : undefined,
    to: to && isValidDate(to) ? to : undefined,
  };

  const ledgers = await payrollLedger(range);
  const owed = ledgers.filter((l) => l.totalAmount > 0);
  const grandTotal = owed.reduce((sum, l) => sum + l.totalAmount, 0);
  const eventsCounted = new Set(
    ledgers.flatMap((l) => l.lines.filter((line) => line.closed && (line.amount ?? 0) > 0))
      .map((line) => line.eventId),
  ).size;

  const settlements = await db
    .select()
    .from(payoutsTable)
    .orderBy(desc(payoutsTable.createdAt))
    .limit(20);

  const rangeLabel =
    range.from && range.to
      ? format(t.credit.rangeBetween, {
          from: formatDate(range.from, locale),
          to: formatDate(range.to, locale),
        })
      : range.from
        ? format(t.credit.rangeFrom, { from: formatDate(range.from, locale) })
        : range.to
          ? format(t.credit.rangeTo, { to: formatDate(range.to, locale) })
          : t.credit.rangeAll;

  const query = new URLSearchParams();
  if (range.from) query.set('from', range.from);
  if (range.to) query.set('to', range.to);
  const exportHref = `/api/credits/export${query.size ? `?${query}` : ''}`;

  return (
    <>
      <PageHeader title={t.credit.payrollTitle} subtitle={t.credit.payrollSubtitle} />

      <RangeForm base={base} t={t} from={range.from} to={range.to} exportHref={exportHref} />

      <StatStrip cols={3} className="mb-4">
        <StatTile
          label={t.credit.grandTotal}
          value={formatMoney(grandTotal, locale)}
          hint={rangeLabel}
          tone={grandTotal > 0 ? 'ok' : 'neutral'}
        />
        <StatTile label={t.credit.peopleWithDays} value={owed.length} />
        <StatTile label={t.credit.eventsCounted} value={eventsCounted} />
      </StatStrip>

      <div className="panel">
        <div className="table-wrap">
          <table className="op-table op-table-stack">
            <thead>
              <tr>
                <th>{t.team.fullName}</th>
                <th>{t.team.employeeCode}</th>
                <th>{t.credit.totalAmount}</th>
                <th>{t.credit.pendingAmount}</th>
                <th>{t.credit.eventsColumn}</th>
              </tr>
            </thead>
            <tbody>
              {ledgers.map((ledger) => (
                <tr key={ledger.memberId}>
                  <td data-label="">
                    <Link
                      href={`${base}/team/${ledger.memberId}`}
                      className="-my-2.5 inline-flex min-h-[44px] items-center py-2.5 font-medium text-ink-100 hover:text-brand-300"
                    >
                      {ledger.name}
                    </Link>
                  </td>
                  <td data-label={t.team.employeeCode} className="nums text-ink-300">
                    {ledger.employeeCode}
                  </td>
                  <td data-label={t.credit.totalAmount}>
                    <span
                      className={`nums font-semibold ${
                        ledger.totalAmount > 0 ? 'text-ink-100' : 'text-ink-500'
                      }`}
                    >
                      {formatAmount(ledger.totalAmount)}
                    </span>
                  </td>
                  <td data-label={t.credit.pendingAmount} className="nums text-ink-400">
                    {ledger.pendingAmount ? formatAmount(ledger.pendingAmount) : '—'}
                  </td>
                  <td data-label={t.credit.eventsColumn} className="text-ink-300">
                    {/*
                      The events behind the number, written out rather than
                      counted, so the total can be checked line by line.
                    */}
                    {ledger.lines.filter((l) => l.closed && (l.amount ?? 0) > 0).length === 0 ? (
                      <span className="text-ink-500">{t.credit.noneInRange}</span>
                    ) : (
                      <ul className="space-y-0.5 text-[12.5px]">
                        {ledger.lines
                          .filter((l) => l.closed && (l.amount ?? 0) > 0)
                          .map((line) => (
                            <li key={line.eventId}>
                              {line.eventName}
                              <span className="nums text-ink-500">
                                {' '}
                                · {formatDate(line.eventDate, locale)} · {formatAmount(line.amount ?? 0)}
                              </span>
                              {line.note ? (
                                <span className="text-ink-500"> · {line.note}</span>
                              ) : null}
                            </li>
                          ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PayoutPanel
        t={t}
        locale={locale}
        from={range.from}
        to={range.to}
        owedTotal={grandTotal}
        owedPeople={owed.length}
        payouts={settlements}
      />
    </>
  );
}
