/**
 * How people are ordered, everywhere.
 *
 * The roster mixes Arabic and Latin names — "براء طالب" sits next to "Baraa
 * Talib" — and the default string comparison puts every Latin name before
 * every Arabic one, which to a supervisor looking for a name reads as no order
 * at all. A collator sorts both scripts the way a person reading the list
 * expects, and `numeric` keeps "البوابة 2" before "البوابة 10".
 *
 * One shared comparator rather than a localeCompare at each call site, so a
 * list cannot quietly be sorted differently from the list next to it.
 */

const collator = new Intl.Collator(['ar', 'en'], {
  numeric: true,
  sensitivity: 'base',
  ignorePunctuation: true,
});

export function compareNames(a: string, b: string): number {
  return collator.compare(a, b);
}

export function byName<T extends { name: string }>(a: T, b: T): number {
  return collator.compare(a.name, b.name);
}

/**
 * Alphabetical, but with cancelled participants at the end.
 *
 * Someone taken off the event is still shown — the record of who was dropped
 * matters — but mixed into the middle of the list they are read as working,
 * and on a phone that is a name somebody walks to a gate looking for. So they
 * sink below everyone who is actually on duty.
 */
export function byStatusThenName<T extends { name: string; status?: string | null }>(
  a: T,
  b: T,
): number {
  const dropped = (row: T) => (row.status === 'CANCELLED' ? 1 : 0);
  return dropped(a) - dropped(b) || collator.compare(a.name, b.name);
}
