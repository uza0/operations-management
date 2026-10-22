/**
 * Money, in Iraqi dinars.
 *
 * The dinar has no subunit in practice — nothing is priced in fils — so an
 * amount is a whole number and is never shown with decimals. Grouping stays in
 * Latin digits with Latin separators in both locales, because that is how the
 * figures appear on every payroll sheet and bank slip the company already
 * uses, and a number a person has to re-read is a number they will get wrong.
 */

/** What one event is worth to one promoter, before anyone is singled out. */
export const DEFAULT_EVENT_PAY = 30_000;

/** Upper bound for a single event's figure — a guard, not a policy. */
export const MAX_EVENT_PAY = 10_000_000;

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** "30,000" — the bare figure, for a table cell that has its own unit header. */
export function formatAmount(value: number): string {
  return grouped.format(Math.round(value));
}

/**
 * "30,000 د.ع" — the figure with its unit, for prose and summaries.
 *
 * The space is non-breaking: in a narrow summary tile a normal one lets the
 * unit drop to its own line, which turns a figure into two lines of nonsense
 * at exactly the size meant to be read at a glance.
 */
export function formatMoney(value: number, locale: string = 'ar'): string {
  const n = grouped.format(Math.round(value));
  return locale === 'ar' ? `${n}\u00A0د.ع` : `IQD\u00A0${n}`;
}
