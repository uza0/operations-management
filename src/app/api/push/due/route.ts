import { getT } from '@/lib/i18n/server';
import { reminderText, sendDueReminders } from '@/server/services/push';
import { advanceEvents } from '@/server/services/lifecycle';

/**
 * The clock reminders, for whoever is due, late to press, or about to leave.
 *
 * Open on purpose, and harmless because of what it does rather than who calls
 * it: it reads nothing out, writes nothing a caller controls, and sends each
 * reminder once however many times it runs. A stranger hitting it repeatedly
 * achieves exactly what the first call achieved.
 *
 * Something has to call it. A cron does if the deployment has one; otherwise
 * the app calls it itself, from the pages people open on an event evening.
 * Both land here, and the sent-once record decides which was first.
 *
 * The lifecycle rides along for the same reason: the two things the clock is
 * responsible for are telling people they are due and marking the evening
 * they are due at as under way, and a second schedule to keep alive for the
 * second half of one job is a second schedule to find broken.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const { t } = await getT();
  /*
   * Stages first, reminders second. An evening that has just become LIVE is
   * one the reminder sweep should already be treating as under way, and the
   * other order leaves it a run behind.
   */
  const moved = await advanceEvents();
  const result = await sendDueReminders(reminderText(t));
  return Response.json(
    { ...result, moved: moved.length },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
