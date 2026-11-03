import 'server-only';

import webpush from 'web-push';
import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventMembers,
  events,
  gates,
  pushSent,
  pushSubscriptions,
  teamMembers,
  workingPoints,
  assignments,
} from '@/db/schema';
import { newId } from '@/lib/ids';

/**
 * Telling a promoter something when the app is shut.
 *
 * Every message in this system used to need somebody to send it: a hundred
 * and twenty WhatsApp messages typed one at a time, and a man who missed one
 * found out he had an event when somebody phoned him. A push notification is
 * the same sentence, delivered by the phone itself.
 *
 * Deliberately few kinds. Four things are worth a phone buzzing in a pocket —
 * you have an event, it starts in an hour, your money went out, and the people
 * running tonight have said something. A fifth would be the one that makes
 * somebody turn all of them off, and then the first four stop arriving too.
 *
 * iPhones only deliver to an installed app: Safari refuses a subscription on
 * a page that is merely open, so the button on his page says so rather than
 * failing silently in front of him.
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:ops@ticketzone.iq';

/** Whether this deployment can send at all. */
export const pushConfigured = () => Boolean(PUBLIC_KEY && PRIVATE_KEY);

/** The public half, which the browser needs to subscribe. Safe to serve. */
export const pushPublicKey = () => PUBLIC_KEY;

if (pushConfigured()) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
}

/* -------------------------------------------------------------------------- */
/* who is listening                                                           */
/* -------------------------------------------------------------------------- */

export type Keys = { endpoint: string; p256dh: string; auth: string };

export async function saveSubscription(
  teamMemberId: string,
  keys: Keys,
  deviceLabel: string | null,
) {
  /*
   * The endpoint is the identity, not the person. The same phone handed from
   * one promoter to another must not keep sending the first man his events,
   * so an endpoint already here is moved to whoever just subscribed.
   */
  const existing = await db.query.pushSubscriptions.findFirst({
    where: eq(pushSubscriptions.endpoint, keys.endpoint),
  });
  if (existing) {
    await db
      .update(pushSubscriptions)
      .set({
        teamMemberId,
        p256dh: keys.p256dh,
        auth: keys.auth,
        deviceLabel,
        updatedAt: new Date(),
      })
      .where(eq(pushSubscriptions.id, existing.id));
    return;
  }
  await db.insert(pushSubscriptions).values({
    id: newId(),
    teamMemberId,
    endpoint: keys.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    deviceLabel,
  });
}

export async function removeSubscription(endpoint: string) {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function removeMemberSubscriptions(teamMemberId: string) {
  await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.teamMemberId, teamMemberId));
}

export async function subscriptionCount(teamMemberId: string) {
  const rows = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.teamMemberId, teamMemberId));
  return rows.length;
}

/* -------------------------------------------------------------------------- */
/* sending                                                                    */
/* -------------------------------------------------------------------------- */

export type Message = {
  title: string;
  body: string;
  /** Where tapping it should land. */
  url: string;
  /** Replaces an earlier notification with the same tag instead of stacking. */
  tag?: string;
};

/**
 * Sends to every phone of these people, and forgets the ones that are gone.
 *
 * Never throws. A notification that fails is a notification that did not
 * arrive; it is not a reason for the thing that triggered it — an invitation
 * going out, a payment file being built — to fail. The caller has already
 * done the work that matters.
 */
export async function pushToMembers(
  teamMemberIds: string[],
  message: Message,
): Promise<{ sent: number; dropped: number }> {
  if (!pushConfigured() || teamMemberIds.length === 0) return { sent: 0, dropped: 0 };

  const rows = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.teamMemberId, [...new Set(teamMemberIds)]));
  if (rows.length === 0) return { sent: 0, dropped: 0 };

  const payload = JSON.stringify(message);
  const dead: string[] = [];
  let sent = 0;

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          payload,
          { TTL: 12 * 60 * 60 },
        );
        sent += 1;
      } catch (error) {
        /*
         * 404 and 410 are the push service saying this endpoint is gone for
         * good — the app was uninstalled, the phone was wiped, the browser
         * dropped it. Anything else may be a bad minute on their side, so the
         * row stays and the next event tries again.
         */
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(row.id);
      }
    }),
  );

  if (dead.length) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, dead));
  }
  if (sent) {
    await db
      .update(pushSubscriptions)
      .set({ lastSentAt: new Date() })
      .where(inArray(pushSubscriptions.id, rows.map((r) => r.id)));
  }
  return { sent, dropped: dead.length };
}

/** Sends only once, whatever calls it and however often. */
export async function pushOnce(
  key: string,
  teamMemberIds: string[],
  message: Message,
): Promise<boolean> {
  const already = await db.query.pushSent.findFirst({ where: eq(pushSent.id, key) });
  if (already) return false;
  /*
   * Claimed before sending, not after. Two page loads a second apart would
   * otherwise both find nothing and both send, which is the exact shape of
   * the bug that makes a phone buzz twice.
   */
  try {
    await db.insert(pushSent).values({ id: key, sentAt: new Date() });
  } catch {
    return false;
  }
  await pushToMembers(teamMemberIds, message);
  return true;
}

/* -------------------------------------------------------------------------- */
/* the hour before                                                            */
/* -------------------------------------------------------------------------- */

/** Baghdad, where the events are. */
const TZ = 'Asia/Baghdad';

function nowInBaghdad() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

const toMinutes = (clock: string) => {
  const [h, m] = clock.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export type DueResult = { checked: number; sent: number };

/**
 * The reminder, for anybody due at the gate within the hour.
 *
 * The window is wide on purpose — anything between forty and a hundred
 * minutes away — because what calls this is not a clock. It is a cron if the
 * deployment has one, and otherwise an ordinary page load on a busy evening,
 * which happens often but not on any schedule. A narrow window would mean a
 * reminder that simply never fires on a quiet afternoon.
 *
 * Wide and sent-once together give the right behaviour: whoever calls first
 * sends it, everybody after finds it already sent.
 */
export async function sendDueReminders(
  text: (row: { event: string; place: string | null; time: string }) => Message,
): Promise<DueResult> {
  if (!pushConfigured()) return { checked: 0, sent: 0 };

  const { date, minutes } = nowInBaghdad();
  const rows = await db
    .select({
      eventMemberId: eventMembers.id,
      teamMemberId: eventMembers.teamMemberId,
      eventId: events.id,
      eventName: events.name,
      arrival: events.teamArrivalTime,
      gateName: gates.name,
      pointName: workingPoints.name,
    })
    .from(eventMembers)
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .leftJoin(assignments, eq(assignments.eventMemberId, eventMembers.id))
    .leftJoin(gates, eq(assignments.gateId, gates.id))
    .leftJoin(workingPoints, eq(assignments.workingPointId, workingPoints.id))
    .where(
      and(
        eq(events.date, date),
        ne(eventMembers.status, 'CANCELLED'),
        inArray(events.status, ['READY', 'LIVE']),
      ),
    );

  let sent = 0;
  for (const row of rows) {
    if (!row.arrival) continue;
    const away = toMinutes(row.arrival) - minutes;
    if (away < 40 || away > 100) continue;
    const did = await pushOnce(
      `arrival:${row.eventMemberId}`,
      [row.teamMemberId],
      text({
        event: row.eventName,
        place: row.gateName ?? row.pointName ?? null,
        time: row.arrival,
      }),
    );
    if (did) sent += 1;
  }
  return { checked: rows.length, sent };
}

export { gte, lte, teamMembers };

/* -------------------------------------------------------------------------- */
/* who an announcement is for                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The people a given announcement actually reaches.
 *
 * An announcement already has an audience — the whole event, one gate, one
 * working point, one person — and the notification has to honour the same
 * one. Sending the gate-three message to a hundred and twenty phones would
 * teach everybody to ignore the next one.
 */
export async function announcementAudience(input: {
  eventId: string;
  audience: string;
  gateId?: string | null;
  workingPointId?: string | null;
  eventMemberId?: string | null;
}): Promise<string[]> {
  if (input.audience === 'MEMBER' && input.eventMemberId) {
    const row = await db
      .select({ teamMemberId: eventMembers.teamMemberId })
      .from(eventMembers)
      .where(eq(eventMembers.id, input.eventMemberId))
      .get();
    return row ? [row.teamMemberId] : [];
  }

  const base = db
    .select({ teamMemberId: eventMembers.teamMemberId })
    .from(eventMembers)
    .leftJoin(assignments, eq(assignments.eventMemberId, eventMembers.id));

  const where =
    input.audience === 'GATE' && input.gateId
      ? and(
          eq(eventMembers.eventId, input.eventId),
          ne(eventMembers.status, 'CANCELLED'),
          eq(assignments.gateId, input.gateId),
        )
      : input.audience === 'WORKING_POINT' && input.workingPointId
        ? and(
            eq(eventMembers.eventId, input.eventId),
            ne(eventMembers.status, 'CANCELLED'),
            eq(assignments.workingPointId, input.workingPointId),
          )
        : and(
            eq(eventMembers.eventId, input.eventId),
            ne(eventMembers.status, 'CANCELLED'),
          );

  const rows = await base.where(where);
  return [...new Set(rows.map((r) => r.teamMemberId))];
}

/* -------------------------------------------------------------------------- */
/* making sure something calls it                                             */
/* -------------------------------------------------------------------------- */

let lastSweep = 0;

/**
 * Runs the due-reminder sweep off the back of an ordinary page load.
 *
 * A reminder an hour before arrival needs something to fire every so often,
 * and a Vercel deployment may or may not have a cron to spare — the smaller
 * plans allow one a day, which is no use to an event that starts at six. So
 * the app does it itself: the pages people open on an event evening are
 * opened constantly, and one of them in ten minutes does the sweep.
 *
 * Never awaited by the page: a promoter opening his own page must not wait
 * on a hundred and twenty push deliveries, and a failure here must not turn
 * his page into an error.
 */
export function sweepInBackground(run: () => Promise<unknown>) {
  const now = Date.now();
  if (now - lastSweep < 10 * 60 * 1000) return;
  lastSweep = now;
  void run().catch(() => {});
}
