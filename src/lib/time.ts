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

const AR_WEEKDAYS = [
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];

const EN_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * "الخميس" for a "YYYY-MM-DD" day. Built from the date parts directly, never
 * from a parsed local Date, so the day named is the day stored.
 */
export function formatWeekday(value: string, locale: 'ar' | 'en' = 'ar'): string {
  if (!isValidDate(value)) return '';
  const [y, m, d] = value.split('-').map(Number);
  const index = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (locale === 'ar' ? AR_WEEKDAYS : EN_WEEKDAYS)[index];
}

/**
 * A moment, as the clock on the venue wall shows it.
 *
 * Baghdad is three hours ahead of UTC all year — there has been no summer
 * time since 2008 — so the wall clock is the instant moved three hours on and
 * read as though it were UTC. Reading the machine's own clock instead was
 * right on a laptop in Baghdad and three hours slow on the server, which
 * keeps UTC: an arrival marked by a leader at ten past nine went on the
 * record as ten past six, beside a promoter's own press at the right time.
 */
const BAGHDAD_OFFSET_MS = 3 * 60 * 60 * 1000;

function baghdadParts(value: Date) {
  const wall = new Date(value.getTime() + BAGHDAD_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}`,
    clock: `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`,
  };
}

/** "HH:mm" in Baghdad for a moment; what an attendance row stores. */
export function baghdadClock(value: Date): string {
  return baghdadParts(value).clock;
}

export function formatDateTime(value: Date | null, locale: 'ar' | 'en' = 'ar'): string {
  if (!value) return '—';
  const { date, clock } = baghdadParts(value);
  return `${formatDate(date, locale)} · ${formatTime(clock, locale)}`;
}

export function formatClock(value: Date | null, locale: 'ar' | 'en' = 'ar'): string {
  if (!value) return '—';
  return formatTime(baghdadParts(value).clock, locale);
}

/**
 * Today at the venue, not today on whatever machine is asking.
 *
 * It is the default on every date field and the stamp on a rate change, and
 * the server runs in UTC — so between midnight and three in the morning
 * Baghdad it used to answer with yesterday, and a rate set at one a.m. took
 * effect a day before anybody meant it to.
 */
export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** The time on the venue wall right now, as "HH:mm". */
export function nowHHmm(): string {
  return baghdadClock(new Date());
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

/**
 * The exact moment a wall clock on a given date falls, in Baghdad.
 *
 * A date and a clock time are not a moment until a place is named. Baghdad
 * keeps one offset all year, which is why this is arithmetic rather than a
 * timezone library — and why a shift ending at half past midnight behaves:
 * the clock reads 00:30, the event is dated the day before, and only a real
 * timestamp reconciles the two.
 */
export function momentOfBaghdad(date: string, clock: string, addDays = 0): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = clock.split(':').map(Number);
  return (
    Date.UTC(y, (m || 1) - 1, (d || 1) + addDays, hh || 0, mm || 0) - BAGHDAD_OFFSET_MS
  );
}
