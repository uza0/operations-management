import type { ReactNode } from 'react';

import { formatAmount } from '@/lib/money';
import type { Dictionary, Locale } from '@/lib/i18n';
import { formatDate } from '@/lib/time';
import type { Insights } from '@/server/services/insights';

/**
 * The pieces every numbers screen is built from.
 *
 * Deliberately theme-free: the same figures are read on a dark screen by
 * whoever runs the operation and printed on white paper for whoever decides
 * what it is worth, and a component that assumes one of the two has to be
 * written twice. Colour comes from the page; shape comes from here.
 */

export function pct(value: number | null): string {
  /*
   * Latin digits, like every other figure in this system. The percentages
   * sit beside money and counts that are grouped in Latin on every payroll
   * sheet the company already uses, and a screen that mixes the two numerals
   * is one a reader has to re-read.
   */
  if (value === null) return '—';
  return `${Math.round(value * 100)}%`;
}

export function num(value: number, digits = 0): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
  }).format(value);
}

export function money(value: number): string {
  return formatAmount(Math.round(value));
}

/** A figure with its name under it, and nothing else. */
export function Figure({
  label,
  value,
  hint,
  className = '',
  valueClassName = '',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[12.5px] font-medium opacity-70">{label}</p>
      <p className={`nums mt-1 text-[24px] font-bold leading-none ${valueClassName}`}>
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-[11.5px] leading-4 opacity-60">{hint}</p> : null}
    </div>
  );
}

/**
 * A row of named quantities drawn as bars.
 *
 * Proportion is the whole point of showing a breakdown at all — "38 FOOTBALL,
 * 12 CONCERT" is a sentence, and a reader has to do arithmetic to learn what
 * the bars say at a glance.
 */
export function Bars({
  rows,
  barClassName = 'bg-brand-400',
  trackClassName = 'bg-ink-800',
}: {
  /** `color` overrides the bar's class — used where the row's colour means something. */
  rows: { label: string; n: number; color?: string }[];
  barClassName?: string;
  trackClassName?: string;
}) {
  const top = Math.max(1, ...rows.map((row) => row.n));
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center gap-3">
          <span className="w-[42%] shrink-0 truncate text-[12.5px]">{row.label}</span>
          <span className={`h-2 flex-1 overflow-hidden rounded-full ${trackClassName}`}>
            <span
              className={`block h-full rounded-full ${row.color ? '' : barClassName}`}
              style={{
                width: `${Math.max(3, (row.n / top) * 100)}%`,
                backgroundColor: row.color,
              }}
            />
          </span>
          <span className="nums w-10 shrink-0 text-end text-[12.5px] font-semibold">
            {num(row.n)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The months, as a table that reads the same on paper and on glass. */
export function MonthTable({
  t,
  data,
  headClassName = 'text-ink-400',
  rowClassName = 'border-ink-800',
  barClassName = 'bg-current opacity-20',
  fillClassName = 'bg-current',
}: {
  t: Dictionary;
  data: Insights['months'];
  headClassName?: string;
  rowClassName?: string;
  barClassName?: string;
  fillClassName?: string;
}) {
  const topShifts = Math.max(1, ...data.map((point) => point.shifts));
  return (
    <table className="w-full text-[12.5px]">
      <thead>
        <tr className={`text-start ${headClassName}`}>
          <th className="py-1.5 text-start font-medium">{t.insights.trend.month}</th>
          <th className="py-1.5 text-start font-medium">{t.insights.trend.events}</th>
          <th className="py-1.5 text-start font-medium">{t.insights.trend.shifts}</th>
          <th className="py-1.5 text-end font-medium">{t.insights.trend.wages}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((point) => (
          <tr key={point.month} className={`border-t ${rowClassName}`}>
            <td className="nums py-1.5 font-semibold">{point.month}</td>
            <td className="nums py-1.5">{num(point.events)}</td>
            <td className="py-1.5">
              <span className="flex items-center gap-2">
                <span className="nums w-7">{num(point.shifts)}</span>
                <span className={`h-1.5 w-20 overflow-hidden rounded-full ${barClassName}`}>
                  <span
                    className={`block h-full rounded-full ${fillClassName}`}
                    style={{ width: `${(point.shifts / topShifts) * 100}%` }}
                  />
                </span>
              </span>
            </td>
            <td className="nums py-1.5 text-end">
              {point.wages > 0 ? money(point.wages) : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The period, written the way the rest of the system writes a date.
 *
 * Not the ISO pair: "2026-01-01 → 2026-12-31" is three runs of Latin digits
 * inside a right-to-left line, and the browser reorders them into something
 * that reads as a different period entirely.
 */
export function rangeLabel(range: { from: string; to: string }, locale: Locale): string {
  return `${formatDate(range.from, locale)} — ${formatDate(range.to, locale)}`;
}

/** "12 تشرين الأول 2026 — 9 تشرين الثاني 2026", or nothing when empty. */
export function spanLabel(
  insights: Insights,
  locale: Locale,
): string | null {
  const { firstDate, lastDate } = insights.events;
  if (!firstDate || !lastDate) return null;
  return `${formatDate(firstDate, locale)} — ${formatDate(lastDate, locale)}`;
}
