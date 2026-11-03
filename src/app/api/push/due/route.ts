import { format } from '@/lib/i18n';
import { getT } from '@/lib/i18n/server';
import { sendDueReminders } from '@/server/services/push';

/**
 * The hour-before reminders, for whoever is due at a gate.
 *
 * Open on purpose, and harmless because of what it does rather than who calls
 * it: it reads nothing out, writes nothing a caller controls, and sends each
 * reminder once however many times it runs. A stranger hitting it repeatedly
 * achieves exactly what the first call achieved.
 *
 * Something has to call it. A cron does if the deployment has one; otherwise
 * the app calls it itself, from the pages people open on an event evening.
 * Both land here, and the sent-once record decides which of them was first.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const { t, locale } = await getT();
  void locale;

  const result = await sendDueReminders((row) => ({
    title: t.push.arrivalTitle,
    body: row.place
      ? format(t.push.arrivalBody, {
          event: row.event,
          place: row.place,
          time: row.time,
        })
      : format(t.push.arrivalBodyNoPlace, { event: row.event, time: row.time }),
    url: '/me',
    tag: 'arrival',
  }));

  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
