import { expireAnnouncementImages } from '@/server/services/announcement-image';
import 'server-only';

import { after } from 'next/server';

import { and, eq, inArray, lte, or } from 'drizzle-orm';

import { db } from '@/db';
import { events, settings } from '@/db/schema';
import { format, getDictionary } from '@/lib/i18n';
import { todayISO } from '@/lib/time';
import { advanceEvents, nagAboutClosing } from '@/server/services/lifecycle';
import { reminderText, sendDueReminders } from '@/server/services/push';

/**
 * Everything the clock is responsible for, in the one order that is right.
 *
 * Stages first, reminders second: an evening that has just become LIVE is one
 * the reminder pass should already be treating as under way, and the other
 * order leaves it a run behind.
 *
 * The words are always the Arabic ones. This used to borrow the language of
 * whoever's page load happened to set it off, so one supervisor browsing in
 * English meant a hundred and twenty promoters were reminded in English — a
 * message's language belongs to the person receiving it, and until each of
 * them has a stored preference that is the language the crew works in.
 */
export async function runSweep() {
  const t = getDictionary('ar');
  const moved = await advanceEvents();
  const nagged = await nagAboutClosing((nag) => ({
    title: t.push.closingTitle,
    body:
      nag.rung === '2h' || nag.rung === '1d'
        ? format(t.push.closingBody, { event: nag.name, n: nag.people })
        : format(t.push.closingBodyLate, {
            event: nag.name,
            n: nag.people,
            days: Math.floor(nag.hours / 24),
          }),
  }));
  const reminders = await sendDueReminders(reminderText(t));
  const imagesCleared = await expireAnnouncementImages().catch(() => 0);
  return { ...reminders, moved: moved.length, nagged: nagged.length, imagesCleared };
}

/*
 * How often the sweep is worth its cost.
 *
 * The outside clock calls every few minutes, day and night, and a full sweep
 * is several queries of work. On a day with nothing near, that is spent
 * moving nothing — and it was most of what the free plan's processor time
 * went on. So: every few minutes while an evening is close (an event today or
 * tomorrow, one ready or live, or a draft being set up), and once an hour
 * otherwise, which still archives the paid ones and nags about the unclosed.
 * In between, a call costs two tiny reads.
 */
const SWEPT_AT = 'sweep.lastAt';
const HOT_GAP = 4 * 60 * 1000;
const QUIET_GAP = 60 * 60 * 1000;

function tomorrowISO(): string {
  const [y, m, d] = todayISO().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

async function eveningIsClose(): Promise<boolean> {
  const row = await db
    .select({ id: events.id })
    .from(events)
    .where(
      or(
        inArray(events.status, ['DRAFT', 'READY', 'LIVE']),
        and(eq(events.status, 'PLANNING'), lte(events.date, tomorrowISO())),
      ),
    )
    .limit(1);
  return row.length > 0;
}

/** Runs the sweep if enough time has passed since the last one, from anywhere. */
export async function runSweepIfDue(minGap = HOT_GAP) {
  const now = Date.now();
  const last = await db.query.settings.findFirst({ where: eq(settings.key, SWEPT_AT) });
  const since = now - Number(last?.value ?? 0);
  if (since < minGap) return { skipped: true as const };
  if (since < QUIET_GAP && !(await eveningIsClose())) return { skipped: true as const };
  await db
    .insert(settings)
    .values({ key: SWEPT_AT, value: String(now) })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(now), updatedAt: new Date() } });
  return runSweep();
}

let lastPageCheck = 0;

/**
 * Runs the sweep off the back of an ordinary page load — now only a backup.
 *
 * A reminder an hour before arrival needs something to fire every so often,
 * and the smaller hosting plans allow one scheduled job a day. An outside
 * clock calling /api/push/due does that every few minutes; this only steps in
 * when that clock has been quiet for a quarter of an hour, so a page no longer
 * carries a second copy of the same work.
 *
 * `after` is the platform's own promise to keep the function alive until the
 * work is done: a serverless function is frozen once its response has gone.
 * Never awaited by the page, and a failure here is never the page's failure.
 */
export function sweepInBackground() {
  const now = Date.now();
  if (now - lastPageCheck < 15 * 60 * 1000) return;
  lastPageCheck = now;
  after(() => runSweepIfDue(15 * 60 * 1000).catch(() => {}));
}
