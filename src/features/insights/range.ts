import { isValidDate, todayISO } from '@/lib/time';
import type { Range } from '@/server/services/insights';

/**
 * The period a numbers screen opens on when nobody has said.
 *
 * A year back to today, because the question this screen answers is about
 * the operation rather than the week, and a default of "this month" would
 * make a company that has been running since the spring look like one that
 * started three weeks ago.
 */
export function defaultInsightRange(): Range {
  const today = todayISO();
  const [year, month, day] = today.split('-').map(Number);
  const from = `${year - 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { from, to: today };
}

/** The dates off the query string, or nothing if either is not a date. */
export function readRange(from?: string, to?: string): Range | null {
  if (!from || !to) return null;
  if (!isValidDate(from) || !isValidDate(to)) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}
