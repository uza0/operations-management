import 'server-only';

import { momentOfBaghdad } from '@/lib/time';

import webpush from 'web-push';
import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';

import { db } from '@/db';
import {
  attendance,
  eventMembers,
  events,
  gates,
  pushSent,
  pushSubscriptions,
  teamMembers,
  workingPoints,
  assignments,
} from '@/db/schema';
import { format, type Dictionary } from '@/lib/i18n';
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
/* the three reminders that are about the clock                               */
/* -------------------------------------------------------------------------- */

/** Baghdad, where the events are, and which keeps one offset all year. */
const TZ = 'Asia/Baghdad';

/**
 * The exact moment a clock time on an event's date actually falls.
 *
 * A date and a wall clock are not a moment until a place is named, and the
 * place is Baghdad. Doing it with a real timestamp rather than minutes-since-
 * midnight is what makes a shift that ends at half past midnight behave: the
 * clock reads 00:30, the event is dated the day before, and the two only
 * reconcile as a moment.
 */
export const momentOf = momentOfBaghdad;

/**
 * Yesterday, today and tomorrow in Baghdad.
 *
 * Yesterday because a shift crosses midnight and its event is still filed
 * under the day it began. Tomorrow because an evening that starts in the
 * small hours is filed under the day it starts, and at half past eleven that
 * event is seventy minutes away and invisible to a sweep that only looks
 * back. The windows are under two hours wide, so the extra day costs nothing
 * and closes the one night of the week this would have gone quiet on.
 */
function baghdadDates() {
  const day = 24 * 60 * 60 * 1000;
  const fmt = (shift: number) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(Date.now() + shift));
  return [fmt(day), fmt(0), fmt(-day)];
}

export type DueResult = { checked: number; sent: number };

export type ReminderKind = 'ARRIVAL' | 'CHECK_IN' | 'CHECK_OUT';

export type ReminderRow = {
  kind: ReminderKind;
  event: string;
  place: string | null;
  time: string;
};

/**
 * Every reminder that is about the clock rather than about a decision.
 *
 * Three of them, and each one exists because of a thing people forget rather
 * than a thing they do not know:
 *
 *   An hour before he is due, that he is due. This one is about getting on a
 *   bus in time, and it goes to everybody.
 *
 *   Half an hour before the match, to press "I arrived" — and only to whoever
 *   has not pressed it. By then he is standing at his gate; what he has
 *   forgotten is the phone in his pocket, and an unpressed arrival is a man
 *   who worked a night the system has no record of.
 *
 *   Half an hour before the shift ends, to press "I am leaving" — and only to
 *   whoever reported an arrival and no departure. People leave when the hall
 *   empties, and nobody has ever remembered this on the way out.
 *
 * The window is wide (fifteen to forty-five minutes for the half-hour ones)
 * because what calls this is not a clock: a cron if the deployment has one,
 * and otherwise an ordinary page load. A narrow window would mean a reminder
 * that simply never fires on a quiet afternoon. Wide and sent-once together
 * give the right behaviour — whoever calls first sends it, everybody after
 * finds it already sent.
 */
export async function sendDueReminders(
  text: (row: ReminderRow) => Message,
): Promise<DueResult> {
  if (!pushConfigured()) return { checked: 0, sent: 0 };

  const dates = baghdadDates();
  const now = Date.now();

  const rows = await db
    .select({
      eventMemberId: eventMembers.id,
      teamMemberId: eventMembers.teamMemberId,
      eventName: events.name,
      eventDate: events.date,
      eventStatus: events.status,
      arrival: events.teamArrivalTime,
      start: events.startTime,
      departure: events.teamDepartureTime,
      gateName: gates.name,
      pointName: workingPoints.name,
      reportedArrivalAt: attendance.reportedArrivalAt,
      reportedDepartureAt: attendance.reportedDepartureAt,
    })
    .from(eventMembers)
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .leftJoin(assignments, eq(assignments.eventMemberId, eventMembers.id))
    .leftJoin(gates, eq(assignments.gateId, gates.id))
    .leftJoin(workingPoints, eq(assignments.workingPointId, workingPoints.id))
    .leftJoin(attendance, eq(attendance.eventMemberId, eventMembers.id))
    .where(
      and(
        inArray(events.date, dates),
        ne(eventMembers.status, 'CANCELLED'),
        inArray(events.status, ['READY', 'LIVE']),
      ),
    );

  let sent = 0;

  const offer = async (
    key: string,
    teamMemberId: string,
    minutesAway: number,
    low: number,
    high: number,
    message: Message,
  ) => {
    if (minutesAway < low || minutesAway > high) return;
    if (await pushOnce(key, [teamMemberId], message)) sent += 1;
  };

  for (const row of rows) {
    const place = row.gateName ?? row.pointName ?? null;
    const away = (moment: number) => (moment - now) / 60000;

    /* An hour before he is due at the gate. */
    if (row.arrival) {
      await offer(
        `arrival:${row.eventMemberId}`,
        row.teamMemberId,
        away(momentOf(row.eventDate, row.arrival)),
        40,
        100,
        text({ kind: 'ARRIVAL', event: row.eventName, place, time: row.arrival }),
      );
    }

    /*
     * Half an hour before the match, to press it — and only if he has not.
     * A man who already reported his arrival is told nothing: a reminder to
     * do what you have done is the one that teaches people to ignore them.
     */
    if (row.start && !row.reportedArrivalAt) {
      await offer(
        `checkin:${row.eventMemberId}`,
        row.teamMemberId,
        away(momentOf(row.eventDate, row.start)),
        15,
        45,
        text({ kind: 'CHECK_IN', event: row.eventName, place, time: row.start }),
      );
    }

    /*
     * And half an hour before the shift ends, to press the other one.
     *
     * Only for somebody who reported an arrival and no departure — anybody
     * else either never came or has already finished. A departure clock
     * earlier than the arrival clock belongs to the next morning, which is
     * the ordinary case for a night that ends at half past midnight.
     */
    if (row.departure && row.reportedArrivalAt && !row.reportedDepartureAt) {
      const crossesMidnight =
        Boolean(row.arrival) && row.departure < (row.arrival as string);
      await offer(
        `checkout:${row.eventMemberId}`,
        row.teamMemberId,
        away(momentOf(row.eventDate, row.departure, crossesMidnight ? 1 : 0)),
        15,
        45,
        text({ kind: 'CHECK_OUT', event: row.eventName, place, time: row.departure }),
      );
    }
  }

  return { checked: rows.length, sent };
}


/* -------------------------------------------------------------------------- */
/* what each of them says                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The wording, in one place.
 *
 * Both callers of the sweep — the endpoint a cron hits and the page load that
 * does it when there is no cron — need the same three sentences, and two
 * copies of a sentence is how one of them quietly stops matching the other.
 */
export const reminderText = (t: Dictionary) => (row: ReminderRow): Message => {
  if (row.kind === 'CHECK_IN') {
    return {
      title: t.push.checkInTitle,
      body: format(t.push.checkInBody, { event: row.event, time: row.time }),
      url: '/me',
      tag: 'checkin',
    };
  }
  if (row.kind === 'CHECK_OUT') {
    return {
      title: t.push.checkOutTitle,
      body: format(t.push.checkOutBody, { event: row.event }),
      url: '/me',
      tag: 'checkout',
    };
  }
  return {
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
  };
};

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
