import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  assignments,
  mainGateDetails,
  mainGateMembers,
  eventMembers,
  gates,
  teamMembers,
  workingPoints,
} from '@/db/schema';
import type { Task } from '@/lib/constants';
import { format, type Dictionary } from '@/lib/i18n';
import { formatDate, formatTime, formatWeekday } from '@/lib/time';

/**
 * The briefing each member gets before an event.
 *
 * One message per person, written from their own assignment — their gate, their
 * task, when to arrive, how to find the place, and their personal link. A
 * message that says "the team meets at 5" makes every member work out what it
 * means for them; this one does not.
 */

export type Briefing = {
  eventMemberId: string;
  name: string;
  phone: string | null;
  /** Digits only, international, ready for a wa.me link — null when unusable. */
  whatsapp: string | null;
  place: string | null;
  task: string | null;
  arrivalTime: string | null;
  isReserve: boolean;
  assigned: boolean;
  notifiedAt: Date | null;
  /** The assignment changed after they were told. Telling them nothing is better. */
  stale: boolean;
  memberUrl: string;
  message: string;
};

/**
 * Turns whatever someone typed into the digits WhatsApp expects.
 *
 * Iraqi numbers arrive in every shape: +964 770 …, 00964770…, 0770…, 770… .
 * A local number starting with 0 becomes the country code plus the rest; a
 * number that already carries a country code is left alone. Anything too short
 * to be a phone number returns null rather than a link that fails silently.
 */
export function toWhatsAppNumber(
  raw: string | null | undefined,
  countryCode = process.env.DEFAULT_COUNTRY_CODE ?? '964',
): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith(countryCode)) {
    // already international
  } else if (digits.startsWith('0')) {
    digits = countryCode + digits.slice(1);
  } else if (digits.length <= 10) {
    digits = countryCode + digits;
  }

  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** wa.me opens WhatsApp on the phone and WhatsApp Web on a laptop, same link. */
export function whatsappLink(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function buildMessage({
  t,
  locale,
  name,
  eventName,
  date,
  arrivalTime,
  venueName,
  locationUrl,
  place,
  task,
  shiftStart,
  shiftEnd,
  memberUrl,
  isReserve,
  sheetUrl,
  mapUrl,
  mainGate,
}: {
  t: Dictionary;
  locale: 'ar' | 'en';
  name: string;
  eventName: string;
  date: string;
  arrivalTime: string;
  venueName: string;
  locationUrl: string | null;
  place: string | null;
  task: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  memberUrl: string;
  isReserve: boolean;
  sheetUrl: string | null;
  /** Their own spot on the venue map — null when no map was uploaded. */
  mapUrl: string | null;
  mainGate: { place: string; start: string; end: string; task: string } | null;
}): string {
  const m = t.notify.message;
  const weekday = formatWeekday(date, locale);
  const lines: string[] = [
    format(m.greeting, { name }),
    '',
    format(m.heading, { event: eventName }),
    format(m.when, { weekday, date: formatDate(date, locale) }),
    format(m.arrival, { time: formatTime(arrivalTime, locale) }),
    format(m.venue, { venue: venueName }),
  ];

  if (locationUrl) lines.push(format(m.location, { url: locationUrl }));

  lines.push('');

  /*
   * The early shift comes before the gate assignment in the message for the
   * same reason it comes first on the sheet: it happens first, and a member
   * who reads only the top of a message has to read the right half of it.
   */
  if (mainGate) {
    lines.push(
      format(m.mainGate, {
        place: mainGate.place,
        from: formatTime(mainGate.start, locale),
        to: formatTime(mainGate.end, locale),
        task: mainGate.task,
      }),
      '',
    );
  }

  if (isReserve) {
    lines.push(m.reserve);
  } else {
    if (place) lines.push(format(m.place, { place }));
    if (task) lines.push(format(m.task, { task }));
    if (shiftStart && shiftEnd) {
      lines.push(
        format(m.shift, {
          from: formatTime(shiftStart, locale),
          to: formatTime(shiftEnd, locale),
        }),
      );
    }
  }

  // Where to stand, drawn on the venue's own photo. It is the member's own
  // page, so it carries nothing anyone else's link would not already show.
  if (mapUrl) lines.push('', format(m.guide, { url: mapUrl }));

  lines.push('', m.linkIntro, memberUrl);

  /*
   * The full sheet, when the supervisor has opened it: a member who wants to
   * see where everyone else is standing gets that without having to ask, and
   * the link is read-only and carries nobody's phone number.
   */
  if (sheetUrl) lines.push('', format(m.sheet, { url: sheetUrl }));

  lines.push('', m.private);

  return lines.join('\n');
}

/**
 * Every member of the event with their own message, ready to send.
 *
 * Reserve members are included deliberately: "you are on standby today" is
 * information they need as much as a gate assignment.
 */
export async function buildBriefings({
  eventId,
  event,
  baseUrl,
  t,
  locale,
}: {
  eventId: string;
  event: {
    name: string;
    date: string;
    teamArrivalTime: string;
    /** Set once the supervisor has opened the public distribution sheet. */
    boardToken?: string | null;
    /** True when a venue photo exists, so a "your spot" link means something. */
    hasMap?: boolean;
    venue: { name: string; locationUrl: string | null };
  };
  baseUrl: string;
  t: Dictionary;
  locale: 'ar' | 'en';
}): Promise<Briefing[]> {
  const rows = await db
    .select({
      eventMemberId: eventMembers.id,
      token: eventMembers.token,
      isReserve: eventMembers.isReserve,
      notifiedAt: eventMembers.notifiedAt,
      name: teamMembers.fullName,
      phone: teamMembers.phone,
      assignmentId: assignments.id,
      assignmentUpdatedAt: assignments.updatedAt,
      task: assignments.task,
      arrivalTime: assignments.arrivalTime,
      shiftStart: assignments.shiftStart,
      shiftEnd: assignments.shiftEnd,
      status: assignments.status,
      gateName: gates.name,
      pointName: workingPoints.name,
    })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .leftJoin(
      assignments,
      and(
        eq(assignments.eventMemberId, eventMembers.id),
        eq(assignments.eventId, eventId),
      ),
    )
    .leftJoin(gates, eq(assignments.gateId, gates.id))
    .leftJoin(workingPoints, eq(assignments.workingPointId, workingPoints.id))
    .where(eq(eventMembers.eventId, eventId))
    .orderBy(teamMembers.fullName);

  /*
   * One query for the whole detail rather than one per member: a roster of
   * ninety people would otherwise mean ninety round trips to build one screen.
   */
  const detail = await db
    .select({
      name: mainGateDetails.name,
      startTime: mainGateDetails.startTime,
      endTime: mainGateDetails.endTime,
      eventMemberId: mainGateMembers.eventMemberId,
      task: mainGateMembers.task,
    })
    .from(mainGateMembers)
    .innerJoin(mainGateDetails, eq(mainGateMembers.detailId, mainGateDetails.id))
    .where(eq(mainGateMembers.eventId, eventId));
  const detailByMember = new Map(detail.map((row) => [row.eventMemberId, row]));

  return rows.map((row) => {
    const active = Boolean(row.assignmentId) && row.status !== 'CANCELLED';
    const place = active ? (row.gateName ?? row.pointName ?? null) : null;
    // Tasks are stored as codes; a member reads "مسح التذاكر", never "ELECTRONIC_SCANNING".
    const task =
      active && row.task ? (t.enums.task[row.task as Task] ?? row.task) : null;
    const memberUrl = `${baseUrl}/member/${row.token}`;
    const arrivalTime = (active ? row.arrivalTime : null) ?? event.teamArrivalTime;
    const early = detailByMember.get(row.eventMemberId);
    const mainGate = early
      ? {
          place: early.name,
          start: early.startTime,
          end: early.endTime,
          task: t.enums.task[early.task as Task] ?? early.task,
        }
      : null;

    return {
      eventMemberId: row.eventMemberId,
      name: row.name,
      phone: row.phone,
      whatsapp: toWhatsAppNumber(row.phone),
      place,
      task,
      arrivalTime,
      isReserve: row.isReserve || !active,
      assigned: active,
      notifiedAt: row.notifiedAt,
      stale: Boolean(
        row.notifiedAt &&
          row.assignmentUpdatedAt &&
          row.assignmentUpdatedAt.getTime() > row.notifiedAt.getTime(),
      ),
      memberUrl,
      message: buildMessage({
        t,
        locale,
        name: row.name,
        eventName: event.name,
        date: event.date,
        arrivalTime,
        venueName: event.venue.name,
        locationUrl: event.venue.locationUrl,
        place,
        task,
        shiftStart: active ? row.shiftStart : null,
        shiftEnd: active ? row.shiftEnd : null,
        memberUrl,
        sheetUrl: event.boardToken ? `${baseUrl}/sheet/${event.boardToken}` : null,
        mapUrl: event.hasMap ? `${memberUrl}/map` : null,
        mainGate,
        isReserve: row.isReserve || !active,
      }),
    };
  });
}
