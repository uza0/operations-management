import 'server-only';

import { after } from 'next/server';

import { format, getDictionary } from '@/lib/i18n';
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
  return { ...reminders, moved: moved.length, nagged: nagged.length };
}

let lastSweep = 0;

/**
 * Runs the sweep off the back of an ordinary page load.
 *
 * A reminder an hour before arrival needs something to fire every so often,
 * and the smaller hosting plans allow one scheduled job a day, which is no
 * use to an event that starts at six. So the pages people open on an event
 * evening do it: one of them in ten minutes carries the sweep. An outside
 * clock calling /api/push/due does the same job on a quiet day.
 *
 * Two things here were wrong before and are the reason this is its own file.
 *
 * It was started and simply left running while the page was sent. A
 * serverless function is frozen once its response has gone, so the sweep was
 * finished only when the platform happened to leave it time — the stages
 * usually moved, the hundred pushes behind them often did not. `after` is the
 * platform's own promise to keep the function alive until the work is done.
 *
 * And every caller passed its own idea of the sweep through one shared
 * ten-minute gate. The supervisor's dashboard passed only the stage changes,
 * so a supervisor opening it shut the gate on the promoters' reminders for
 * the next ten minutes. There is one sweep now, and whoever opens the gate
 * runs all of it.
 *
 * Never awaited by the page, and a failure here is never the page's failure.
 */
export function sweepInBackground() {
  const now = Date.now();
  if (now - lastSweep < 10 * 60 * 1000) return;
  lastSweep = now;
  after(() => runSweep().catch(() => {}));
}
