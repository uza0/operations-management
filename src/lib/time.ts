/**
 * Times are stored as "HH:mm" strings and calendar days as "YYYY-MM-DD".
 * Nothing here converts through a timezone, so an arrival time set as 16:30
 * always reads back as 16:30 on every device.
 */

export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Formats "16:30" as "4:30 PM" (en) or "٤:٣٠ م" style 12h text (ar). */
export function formatTime(time: string, locale: 'ar' | 'en' = 'ar'): string {
  if (!isValidTime(time)) return time;
  const [h, m] = time.split(':').map(Number);
  const suffix = locale === 'ar' ? (h < 12 ? 'ص' : 'م') : h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

const AR_MONTHS = [
  'كانون الثاني',
  'شباط',
  'آذار',
  'نيسان',
  'أيار',
  'حزيران',
  'تموز',
  'آب',
  'أيلول',
  'تشرين الأول',
  'تشرين الثاني',
  'كانون الأول',
];

const EN_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatDate(date: string, locale: 'ar' | 'en' = 'ar'): string {
  if (!isValidDate(date)) return date;
  const [y, m, d] = date.split('-').map(Number);
  const months = locale === 'ar' ? AR_MONTHS : EN_MONTHS;
  return locale === 'ar'
    ? `${d} ${months[m - 1]} ${y}`
    : `${d} ${months[m - 1]} ${y}`;
}

export function formatDateTime(value: Date | null, locale: 'ar' | 'en' = 'ar'): string {
  if (!value) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  return `${formatDate(date, locale)} · ${formatTime(`${pad(value.getHours())}:${pad(value.getMinutes())}`, locale)}`;
}

export function formatClock(value: Date | null, locale: 'ar' | 'en' = 'ar'): string {
  if (!value) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return formatTime(`${pad(value.getHours())}:${pad(value.getMinutes())}`, locale);
}

export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nowHHmm(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Half-open overlap test on "HH:mm" ranges. A shift that ends exactly when
 * another starts is NOT a conflict — that is a normal handover.
 * Ranges crossing midnight (end <= start) are treated as ending next day.
 */
export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const a1 = toMinutes(aStart);
  let a2 = toMinutes(aEnd);
  const b1 = toMinutes(bStart);
  let b2 = toMinutes(bEnd);
  if (a2 <= a1) a2 += 24 * 60;
  if (b2 <= b1) b2 += 24 * 60;
  return a1 < b2 && b1 < a2;
}
