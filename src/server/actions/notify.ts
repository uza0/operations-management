'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventMembers,
  events,
  seatSetupMembers,
  teamMembers,
  venues,
} from '@/db/schema';
import { format } from '@/lib/i18n';
import { getT } from '@/lib/i18n/server';
import { formatDate, formatTime } from '@/lib/time';
import type { EventType } from '@/lib/constants';
import { RESPONSE_WINDOW_HOURS, responseDeadline } from '@/lib/journey';
import { assertEventManager } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';
import { buildBriefings, resolveBaseUrl } from '@/server/services/notify';
import { pushToMembers } from '@/server/services/push';
import { readConfig, sendTemplate } from '@/server/services/whatsapp';

import { fail, ok, type ActionState } from './types';

/**
 * Records that a member was sent their briefing.
 *
 * The sending itself happens in WhatsApp, on the organiser's own phone or
 * laptop — this is the part the system can actually know about: who was told,
 * when, and by whom. Kept honest on purpose: it says "a message was opened for
 * this person", which is why the button that triggers it is the same button
 * that opens the chat.
 */

/**
 * Stamps the response deadline at the moment the link goes out.
 *
 * Computed once and stored, never worked out again on the way in: a deadline
 * recomputed on every page load is one that never arrives, and the man
 * refreshing at midnight would see eighteen hours left for ever.
 *
 * It can come back null, and that is a real answer — an invitation sent two
 * hours before the team is due has no room for a deadline, so it gets none
 * and shows up on the leader's screen as urgent instead of as already late.
 */
async function stampDeadlines(eventId: string, ids: string[], sentAt: Date) {
  const event = await db
    .select({
      date: events.date,
      arrival: events.teamArrivalTime,
      window: events.responseWindowHours,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .get();
  if (!event) return;

  const respondBy = responseDeadline({
    notifiedAt: sentAt,
    eventDate: event.date,
    teamArrivalTime: event.arrival,
    windowHours: event.window ?? RESPONSE_WINDOW_HOURS,
  });

  await db
    .update(eventMembers)
    .set({ respondBy, updatedAt: sentAt })
    .where(and(eq(eventMembers.eventId, eventId), inArray(eventMembers.id, ids)));
}

export async function markBriefedAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  let user;
  try {
    user = await assertEventManager(eventId);
  } catch {
    return fail(t.errors.forbidden);
  }

  const ids = form.getAll('eventMemberIds').map(String).filter(Boolean);
  if (ids.length === 0) return fail(t.errors.required);

  const rows = await db
    .select({ id: eventMembers.id, name: teamMembers.fullName })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(and(eq(eventMembers.eventId, eventId), inArray(eventMembers.id, ids)));

  if (rows.length === 0) return fail(t.errors.notFound);

  const sentAt = new Date();
  await db
    .update(eventMembers)
    .set({ notifiedAt: sentAt, notifiedById: user.id, updatedAt: sentAt })
    .where(and(eq(eventMembers.eventId, eventId), inArray(eventMembers.id, ids)));
  await stampDeadlines(eventId, ids, sentAt);

  /*
   * The chair day rides on the same message, because it rides on the same
   * link: one WhatsApp goes out and his page carries both questions. So the
   * crew rows are stamped as asked at the same moment — it is what lets the
   * chair board tell "he has not answered" apart from "nobody has asked him".
   */
  await db
    .update(seatSetupMembers)
    .set({ notifiedAt: sentAt, updatedAt: sentAt })
    .where(
      and(
        eq(seatSetupMembers.eventId, eventId),
        inArray(seatSetupMembers.eventMemberId, ids),
        isNull(seatSetupMembers.notifiedAt),
      ),
    );

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'ANNOUNCE',
    entity: 'EVENT_MEMBER',
    entityId: rows.length === 1 ? rows[0].id : null,
    entityLabel: rows.length === 1 ? rows[0].name : `${rows.length}`,
    summary:
      rows.length === 1
        ? `${t.notify.title}: ${rows[0].name}`
        : `${t.notify.title}: ${rows.length}`,
  });

  /*
   * And a notification, for anybody whose phone is listening.
   *
   * This is the moment the invitation goes out, so it is the moment his phone
   * should say so. It does not replace the message the leader sends — a man
   * with notifications off still gets WhatsApp — it just means most of them
   * know before anybody types anything.
   */
  try {
    const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
    if (event) {
      const people = await db
        .select({ teamMemberId: eventMembers.teamMemberId })
        .from(eventMembers)
        .where(inArray(eventMembers.id, ids));
      const { locale } = await getT();
      await pushToMembers(
        people.map((p) => p.teamMemberId),
        {
          title: t.push.invitedTitle,
          body: format(t.push.invitedBody, {
            event: event.name,
            date: formatDate(event.date, locale),
            time: event.teamArrivalTime ?? '',
          }),
          url: '/me',
          tag: `event:${eventId}`,
        },
      );
    }
  } catch {
    /* The invitation is recorded; delivery is best effort. */
  }

  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${eventId}/notify`);
    revalidatePath(`${base}/events/${eventId}/team`);
  }
  return ok();
}

/** Clears the briefing marks, so a whole event can be briefed again from zero. */
export async function resetBriefingsAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  let user;
  try {
    user = await assertEventManager(eventId);
  } catch {
    return fail(t.errors.forbidden);
  }

  await db
    .update(eventMembers)
    .set({ notifiedAt: null, notifiedById: null, updatedAt: new Date() })
    .where(eq(eventMembers.eventId, eventId));

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'EVENT_MEMBER',
    summary: `${t.notify.title} — ${t.common.reset}`,
  });

  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${eventId}/notify`);
  }
  return ok();
}

/**
 * Sends the briefing to everyone through the official WhatsApp Cloud API.
 *
 * One request per member rather than a broadcast: WhatsApp has no "send to a
 * list" call for business-initiated messages, and each person's message
 * carries their own gate, their own hours and their own private link anyway.
 * A failure is recorded per person and the run continues — a roster of ninety
 * always has one wrong number, and the other eighty-nine still have to be
 * told.
 *
 * Only the people who still need telling are included: whoever has already
 * been briefed and has not been moved since is skipped, so pressing the button
 * twice does not message the whole team twice.
 */
export async function sendBriefingsViaApiAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t, locale } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  let user;
  try {
    user = await assertEventManager(eventId);
  } catch {
    return fail(t.errors.forbidden);
  }

  const config = readConfig();
  if (!config) return fail(t.notify.apiNotConfigured);

  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!event) return fail(t.errors.notFound);
  const venue = event.venueId
    ? await db.query.venues.findFirst({ where: eq(venues.id, event.venueId) })
    : null;

  const baseUrl = await resolveBaseUrl();
  const briefings = await buildBriefings({
    eventId,
    event: {
      name: event.name,
      date: event.date,
      teamArrivalTime: event.teamArrivalTime,
      type: event.type as EventType,
      boardToken: event.boardToken,
      hasMap: Boolean(event.mapImageUrl ?? venue?.mapImageUrl),
      venue: { name: venue?.name ?? '', locationUrl: venue?.locationUrl ?? null },
    },
    baseUrl,
    t,
    locale,
  });

  const queue = briefings.filter(
    (row) => row.whatsapp && (!row.notifiedAt || row.stale),
  );
  if (queue.length === 0) return ok(t.notify.allDone);

  const sent: string[] = [];
  const failures: string[] = [];

  for (const row of queue) {
    const to = row.whatsapp;
    if (!to) continue;
    const result = await sendTemplate(config, to, [
      row.name,
      event.name,
      formatDate(event.date, locale),
      row.place ?? t.notify.reserveShort,
      formatTime(row.arrivalTime ?? event.teamArrivalTime, locale),
      row.memberUrl,
    ]);
    if (result.ok) sent.push(row.eventMemberId);
    else failures.push(`${row.name}: ${result.error ?? ''}`.trim());
  }

  if (sent.length > 0) {
    const sentAt = new Date();
    await db
      .update(eventMembers)
      .set({ notifiedAt: sentAt, notifiedById: user.id, updatedAt: sentAt })
      .where(and(eq(eventMembers.eventId, eventId), inArray(eventMembers.id, sent)));
    await stampDeadlines(eventId, sent, sentAt);
  }

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'ANNOUNCE',
    entity: 'EVENT_MEMBER',
    entityId: null,
    entityLabel: `${sent.length}`,
    // Numbers and names only — never the token, never the message bodies.
    newValues: { sent: sent.length, failed: failures.length, via: 'cloud-api' },
    summary: `${t.notify.apiSent}: ${sent.length}`,
  });

  revalidatePath(`/admin/events/${eventId}/notify`);

  if (failures.length > 0) {
    return fail(
      `${format(t.notify.apiPartial, { sent: String(sent.length), failed: String(failures.length) })} — ${failures.slice(0, 5).join(' · ')}`,
    );
  }
  return ok(format(t.notify.apiAllSent, { n: String(sent.length) }));
}
