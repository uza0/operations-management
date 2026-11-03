import { getT } from '@/lib/i18n/server';
import { reminderText, sendDueReminders } from '@/server/services/push';

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
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const { t } = await getT();
  const result = await sendDueReminders(reminderText(t));
  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
