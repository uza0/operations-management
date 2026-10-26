'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  attendance,
  eventMembers,
  events,
  seatSetupDetails,
  seatSetupMembers,
} from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { DECLINE_REASONS, type DeclineReason } from '@/lib/constants';
import {
  ARRIVAL_WINDOW_HOURS,
  seatStageFor,
  stageFor,
  venueMoment,
  type SeatStage,
} from '@/lib/journey';
import { str } from '@/lib/validation';
import { assertEventStaff } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';
import { resolveMemberByToken } from '@/server/services/member';

import { fail, ok, type ActionState } from './types';

/**
 * The four things a promoter does with his own link: answer the invitation
 * either way, say he has arrived, and say he has gone.
 *
 * Every one of them is checked against the stage on the server. The page
 * hides the buttons that do not belong to the moment, but hiding a button is
 * decoration — these are the checks.
 */

/**
 * The clock on the wall at the venue, not the clock on the server.
 *
 * Every time written into an attendance row is a venue time: the server runs
 * in UTC, and "17:40" on somebody's record has to mean twenty to six in
 * Baghdad or it means nothing at all.
 */
function baghdadClock(at: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Baghdad',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
}

function revalidate(token: string, eventId: string) {
  revalidatePath(`/member/${token}`);
  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${eventId}/team`);
    revalidatePath(`${base}/events/${eventId}/attendance`);
    revalidatePath(`${base}/events/${eventId}`);
  }
}

/** The whole picture one of these actions needs, or a reason it cannot run. */
type Loaded =
  | { ok: false; error: string }
  | {
      ok: true;
      t: Awaited<ReturnType<typeof getT>>['t'];
      member: NonNullable<Awaited<ReturnType<typeof resolveMemberByToken>>>;
      row: NonNullable<Awaited<ReturnType<typeof loadRow>>>;
      att: Awaited<ReturnType<typeof loadAttendance>>;
      stage: ReturnType<typeof stageFor>;
    };

async function load(token: string): Promise<Loaded> {
  const { t } = await getT();
  const member = await resolveMemberByToken(token);
  if (!member) return { ok: false, error: t.member.invalidToken };
  if (member.status === 'CANCELLED') return { ok: false, error: t.member.cancelled };
  if (member.tokenExpiresAt && member.tokenExpiresAt.getTime() < Date.now()) {
    return { ok: false, error: t.member.expiredToken };
  }

  const row = await loadRow(member.id);
  if (!row) return { ok: false, error: t.errors.notFound };

  const att = await loadAttendance(member.id);

  const stage = stageFor({
    memberStatus: row.status,
    confirmedAt: row.confirmedAt,
    declinedAt: row.declinedAt,
    eventStatus: row.eventStatus,
    attendanceStatus: att?.status ?? null,
    reportedArrivalAt: att?.reportedArrivalAt ?? null,
    approvedAt: att?.approvedAt ?? null,
    reportedDepartureAt: att?.reportedDepartureAt ?? null,
    eventDate: row.eventDate,
    teamArrivalTime: row.teamArrivalTime,
    arrivalWindowHours: ARRIVAL_WINDOW_HOURS,
    now: new Date(),
  });

  return { ok: true, t, member, row, att, stage };
}

/** The membership and the few event facts the stage needs. */
function loadRow(eventMemberId: string) {
  return db
    .select({
      id: eventMembers.id,
      eventId: eventMembers.eventId,
      status: eventMembers.status,
      confirmedAt: eventMembers.confirmedAt,
      declinedAt: eventMembers.declinedAt,
      respondBy: eventMembers.respondBy,
      eventStatus: events.status,
      eventDate: events.date,
      teamArrivalTime: events.teamArrivalTime,
    })
    .from(eventMembers)
    .innerJoin(events, eq(eventMembers.eventId, events.id))
    .where(eq(eventMembers.id, eventMemberId))
    .get();
}

function loadAttendance(eventMemberId: string) {
  return db
    .select()
    .from(attendance)
    .where(eq(attendance.eventMemberId, eventMemberId))
    .get();
}

/**
 * "I'll be there."
 *
 * Idempotent on purpose: a thumb on a slow connection presses twice, and the
 * second press must find the answer already recorded and say so quietly
 * rather than write a second one.
 */
export async function confirmInvitationAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const token = String(form.get('token') ?? '');
  const loaded = await load(token);
  if (!loaded.ok) return fail(loaded.error);
  const { t, row } = loaded;

  if (row.confirmedAt) return ok(t.journey.alreadyConfirmed);
  if (row.declinedAt) return fail(t.journey.alreadyDeclined);

  /*
   * A passed deadline does not refuse the answer. The leader has not
   * cancelled him — if he had, the membership would be CANCELLED and this
   * would have stopped above — so a late yes is still a yes, and a man who
   * turns up is better than an empty gate.
   */
  await db
    .update(eventMembers)
    .set({ confirmedAt: new Date(), status: 'CONFIRMED', updatedAt: new Date() })
    .where(eq(eventMembers.id, row.id));

  await recordAudit({
    eventId: row.eventId,
    actorId: null,
    actorName: loaded.member.name,
    action: 'UPDATE',
    entity: 'EVENT_MEMBER',
    entityId: row.id,
    entityLabel: loaded.member.name,
    summary: t.journey.confirmedSummary,
  });

  revalidate(token, row.eventId);
  return ok(t.journey.confirmedThanks);
}

/** "I can't make it." A reason is offered, never demanded. */
export async function declineInvitationAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const token = String(form.get('token') ?? '');
  const loaded = await load(token);
  if (!loaded.ok) return fail(loaded.error);
  const { t, row } = loaded;

  if (row.declinedAt) return ok(t.journey.alreadyDeclined);
  if (row.confirmedAt) return fail(t.journey.alreadyConfirmed);

  const picked = str(form, 'reason');
  const reason =
    picked && (DECLINE_REASONS as readonly string[]).includes(picked)
      ? (picked as DeclineReason)
      : null;

  await db
    .update(eventMembers)
    .set({
      declinedAt: new Date(),
      declineReason: reason,
      status: 'CANCELLED',
      updatedAt: new Date(),
    })
    .where(eq(eventMembers.id, row.id));

  await recordAudit({
    eventId: row.eventId,
    actorId: null,
    actorName: loaded.member.name,
    action: 'UPDATE',
    entity: 'EVENT_MEMBER',
    entityId: row.id,
    entityLabel: loaded.member.name,
    newValues: reason ? { reason } : null,
    summary: t.journey.declinedSummary,
  });

  revalidate(token, row.eventId);
  return ok(t.journey.declinedThanks);
}

/**
 * "I'm here."
 *
 * Records the moment he said it and nothing else. It does not mark him
 * present: that is somebody else's sentence, and the gap between the two is
 * the point — his time is his time, and the approval has its own.
 */
export async function reportArrivalAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const token = String(form.get('token') ?? '');
  const loaded = await load(token);
  if (!loaded.ok) return fail(loaded.error);
  const { t, row, att, stage } = loaded;

  if (!row.confirmedAt) return fail(t.journey.confirmFirst);
  if (att?.reportedArrivalAt) return ok(t.journey.arrivalAlready);
  /* The window is enforced here, not by hiding the button. */
  if (stage !== 'ARRIVING') return fail(t.journey.tooEarly);

  const now = new Date();
  const clock = baghdadClock(now);

  if (att) {
    await db
      .update(attendance)
      .set({ reportedArrivalAt: now, checkInTime: att.checkInTime ?? clock, updatedAt: now })
      .where(eq(attendance.id, att.id));
  } else {
    await db.insert(attendance).values({
      id: newId(),
      eventId: row.eventId,
      eventMemberId: row.id,
      status: 'PENDING',
      reportedArrivalAt: now,
      checkInTime: clock,
    });
  }

  await recordAudit({
    eventId: row.eventId,
    actorId: null,
    actorName: loaded.member.name,
    action: 'UPDATE',
    entity: 'ATTENDANCE',
    entityId: row.id,
    entityLabel: loaded.member.name,
    newValues: { reportedArrival: clock },
    summary: `${t.journey.arrivalSummary}: ${clock}`,
  });

  revalidate(token, row.eventId);
  return ok(t.journey.arrivalRecorded);
}

/** "I'm off." The end of his evening, in his own words and his own clock. */
export async function reportDepartureAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const token = String(form.get('token') ?? '');
  const loaded = await load(token);
  if (!loaded.ok) return fail(loaded.error);
  const { t, row, att, stage } = loaded;

  if (stage !== 'ON_DUTY') return fail(t.journey.notOnDuty);
  if (!att) return fail(t.errors.notFound);
  if (att.reportedDepartureAt) return ok(t.journey.departureAlready);

  const now = new Date();
  const clock = baghdadClock(now);

  await db
    .update(attendance)
    .set({
      reportedDepartureAt: now,
      checkOutTime: att.checkOutTime ?? clock,
      updatedAt: now,
    })
    .where(eq(attendance.id, att.id));

  await recordAudit({
    eventId: row.eventId,
    actorId: null,
    actorName: loaded.member.name,
    action: 'UPDATE',
    entity: 'ATTENDANCE',
    entityId: row.id,
    entityLabel: loaded.member.name,
    newValues: { reportedDeparture: clock },
    summary: `${t.journey.departureSummary}: ${clock}`,
  });

  revalidate(token, row.eventId);
  return ok(t.journey.departureRecorded);
}

/**
 * A supervisor confirms that somebody is standing where they say they are.
 *
 * The one place the evening's tools are opened, and it is opened by a person
 * rather than by a clock. Several names at once, because at five o'clock a
 * gate leader has forty of them and one tap each is not a workflow.
 */
export async function approveArrivalsAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventStaff(eventId).catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const ids = [...new Set(form.getAll('eventMemberId').map(String).filter(Boolean))];
  if (ids.length === 0) return ok();

  const event = await db
    .select({ date: events.date, arrival: events.teamArrivalTime })
    .from(events)
    .where(eq(events.id, eventId))
    .get();
  if (!event) return fail(t.errors.notFound);
  const due = venueMoment(event.date, event.arrival);

  const now = new Date();
  let approved = 0;
  for (const id of ids) {
    const att = await db
      .select()
      .from(attendance)
      .where(and(eq(attendance.eventMemberId, id), eq(attendance.eventId, eventId)))
      .get();
    if (!att || !att.reportedArrivalAt || att.approvedAt) continue;

    /*
     * Late is a timekeeping fact, not a punishment, and it is worked out from
     * the time he said he arrived rather than from the time anybody got round
     * to approving it.
     */
    const status = att.reportedArrivalAt.getTime() > due.getTime() ? 'LATE' : 'PRESENT';

    await db
      .update(attendance)
      .set({ approvedAt: now, approvedById: user.id, status, updatedAt: now })
      .where(eq(attendance.id, att.id));
    approved += 1;
  }

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'ATTENDANCE',
    entityId: eventId,
    entityLabel: t.journey.approveTitle,
    newValues: { approved },
    summary: `${t.journey.approveSummary}: ${approved}`,
  });

  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${eventId}/attendance`);
  }
  return ok();
}

/* -------------------------------------------------------------------------- */
/* The chair day, answered and attended in its own right                       */
/* -------------------------------------------------------------------------- */

/**
 * The crew row this token's owner is being asked about.
 *
 * The id comes from the form, so it is checked against the token rather than
 * trusted: a crew row that belongs to somebody else is not found, which is
 * the same answer as one that does not exist. Nothing here lets a member
 * reach another member's day.
 */
async function loadSeatRow(eventMemberId: string, seatMemberId: string) {
  return db
    .select({
      id: seatSetupMembers.id,
      eventId: seatSetupMembers.eventId,
      eventMemberId: seatSetupMembers.eventMemberId,
      confirmedAt: seatSetupMembers.confirmedAt,
      declinedAt: seatSetupMembers.declinedAt,
      reportedArrivalAt: seatSetupMembers.reportedArrivalAt,
      approvedAt: seatSetupMembers.approvedAt,
      reportedDepartureAt: seatSetupMembers.reportedDepartureAt,
      attended: seatSetupMembers.attended,
      checkInTime: seatSetupMembers.checkInTime,
      checkOutTime: seatSetupMembers.checkOutTime,
      date: seatSetupDetails.date,
      startTime: seatSetupDetails.startTime,
    })
    .from(seatSetupMembers)
    .innerJoin(seatSetupDetails, eq(seatSetupMembers.detailId, seatSetupDetails.id))
    .where(
      and(
        eq(seatSetupMembers.id, seatMemberId),
        eq(seatSetupMembers.eventMemberId, eventMemberId),
      ),
    )
    .get();
}

type SeatLoaded =
  | { ok: false; error: string }
  | {
      ok: true;
      t: Awaited<ReturnType<typeof getT>>['t'];
      member: NonNullable<Awaited<ReturnType<typeof resolveMemberByToken>>>;
      seat: NonNullable<Awaited<ReturnType<typeof loadSeatRow>>>;
      stage: SeatStage;
    };

async function loadSeat(token: string, seatMemberId: string): Promise<SeatLoaded> {
  const { t } = await getT();
  const member = await resolveMemberByToken(token);
  if (!member) return { ok: false, error: t.member.invalidToken };
  if (member.tokenExpiresAt && member.tokenExpiresAt.getTime() < Date.now()) {
    return { ok: false, error: t.member.expiredToken };
  }

  const seat = await loadSeatRow(member.id, seatMemberId);
  if (!seat) return { ok: false, error: t.errors.notFound };

  return {
    ok: true,
    t,
    member,
    seat,
    stage: seatStageFor({
      confirmedAt: seat.confirmedAt,
      declinedAt: seat.declinedAt,
      reportedArrivalAt: seat.reportedArrivalAt,
      approvedAt: seat.approvedAt,
      reportedDepartureAt: seat.reportedDepartureAt,
      attended: seat.attended,
      date: seat.date,
      startTime: seat.startTime,
      arrivalWindowHours: ARRIVAL_WINDOW_HOURS,
      now: new Date(),
    }),
  };
}

function revalidateSeat(token: string, eventId: string) {
  revalidatePath(`/member/${token}`);
  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${eventId}/seats`);
  }
}

/** "I'll come and set out the chairs." A yes to the day, not to the night. */
export async function confirmSeatSetupAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const token = String(form.get('token') ?? '');
  const loaded = await loadSeat(token, String(form.get('seatMemberId') ?? ''));
  if (!loaded.ok) return fail(loaded.error);
  const { t, seat } = loaded;

  if (seat.confirmedAt) return ok(t.journey.alreadyConfirmed);
  if (seat.declinedAt) return fail(t.journey.alreadyDeclined);

  const now = new Date();
  await db
    .update(seatSetupMembers)
    .set({ confirmedAt: now, updatedAt: now })
    .where(eq(seatSetupMembers.id, seat.id));

  await recordAudit({
    eventId: seat.eventId,
    actorId: null,
    actorName: loaded.member.name,
    action: 'UPDATE',
    entity: 'EVENT_MEMBER',
    entityId: seat.eventMemberId,
    entityLabel: loaded.member.name,
    summary: `${t.seatSetup.title}: ${t.journey.confirmedSummary}`,
  });

  revalidateSeat(token, seat.eventId);
  return ok(t.journey.confirmedThanks);
}

/**
 * "Not that afternoon."
 *
 * It takes him off the crew and leaves him on the event: the two invitations
 * are separate questions, and answering one of them no is not answering the
 * other. The leader sees the gap on the chair board and fills it.
 */
export async function declineSeatSetupAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const token = String(form.get('token') ?? '');
  const loaded = await loadSeat(token, String(form.get('seatMemberId') ?? ''));
  if (!loaded.ok) return fail(loaded.error);
  const { t, seat } = loaded;

  if (seat.declinedAt) return ok(t.journey.alreadyDeclined);
  if (seat.confirmedAt) return fail(t.journey.alreadyConfirmed);

  const picked = str(form, 'reason');
  const reason =
    picked && (DECLINE_REASONS as readonly string[]).includes(picked) ? picked : null;

  const now = new Date();
  await db
    .update(seatSetupMembers)
    .set({ declinedAt: now, declineReason: reason, updatedAt: now })
    .where(eq(seatSetupMembers.id, seat.id));

  await recordAudit({
    eventId: seat.eventId,
    actorId: null,
    actorName: loaded.member.name,
    action: 'UPDATE',
    entity: 'EVENT_MEMBER',
    entityId: seat.eventMemberId,
    entityLabel: loaded.member.name,
    newValues: reason ? { reason } : null,
    summary: `${t.seatSetup.title}: ${t.journey.declinedSummary}`,
  });

  revalidateSeat(token, seat.eventId);
  return ok(t.journey.declinedThanks);
}

/** "I'm at the hall." The same sentence as the night, on the earlier day. */
export async function reportSeatArrivalAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const token = String(form.get('token') ?? '');
  const loaded = await loadSeat(token, String(form.get('seatMemberId') ?? ''));
  if (!loaded.ok) return fail(loaded.error);
  const { t, seat, stage } = loaded;

  if (!seat.confirmedAt) return fail(t.journey.confirmFirst);
  if (seat.reportedArrivalAt) return ok(t.journey.arrivalAlready);
  if (stage !== 'ARRIVING') return fail(t.journey.tooEarly);

  const now = new Date();
  const clock = baghdadClock(now);
  await db
    .update(seatSetupMembers)
    .set({
      reportedArrivalAt: now,
      checkInTime: seat.checkInTime ?? clock,
      updatedAt: now,
    })
    .where(eq(seatSetupMembers.id, seat.id));

  await recordAudit({
    eventId: seat.eventId,
    actorId: null,
    actorName: loaded.member.name,
    action: 'ATTENDANCE',
    entity: 'EVENT_MEMBER',
    entityId: seat.eventMemberId,
    entityLabel: loaded.member.name,
    newValues: { reportedArrival: clock },
    summary: `${t.seatSetup.title}: ${t.journey.arrivalSummary} ${clock}`,
  });

  revalidateSeat(token, seat.eventId);
  return ok(t.journey.arrivalRecorded);
}

/** "The hall is ready and I'm off." */
export async function reportSeatDepartureAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const token = String(form.get('token') ?? '');
  const loaded = await loadSeat(token, String(form.get('seatMemberId') ?? ''));
  if (!loaded.ok) return fail(loaded.error);
  const { t, seat, stage } = loaded;

  if (stage !== 'ON_DUTY') return fail(t.journey.notOnDuty);
  if (seat.reportedDepartureAt) return ok(t.journey.departureAlready);

  const now = new Date();
  const clock = baghdadClock(now);
  await db
    .update(seatSetupMembers)
    .set({
      reportedDepartureAt: now,
      checkOutTime: seat.checkOutTime ?? clock,
      updatedAt: now,
    })
    .where(eq(seatSetupMembers.id, seat.id));

  revalidateSeat(token, seat.eventId);
  return ok(t.journey.departureRecorded);
}

/**
 * The supervisor confirms the crew is in the hall.
 *
 * This is the only thing that sets `attended`, and `attended` is the only
 * thing that pays the day. A man cannot put thirty thousand dinars on his own
 * account by pressing a button on his phone from the car park.
 */
export async function approveSeatArrivalsAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const eventId = String(form.get('eventId') ?? '');
  const user = await assertEventStaff(eventId).catch(() => null);
  if (!user) return fail(t.errors.forbidden);

  const ids = [...new Set(form.getAll('seatMemberId').map(String).filter(Boolean))];
  if (ids.length === 0) return ok();

  const now = new Date();
  let approved = 0;
  for (const id of ids) {
    const row = await db
      .select()
      .from(seatSetupMembers)
      .where(and(eq(seatSetupMembers.id, id), eq(seatSetupMembers.eventId, eventId)))
      .get();
    if (!row || !row.reportedArrivalAt || row.approvedAt) continue;

    await db
      .update(seatSetupMembers)
      .set({ approvedAt: now, approvedById: user.id, attended: true, updatedAt: now })
      .where(eq(seatSetupMembers.id, row.id));
    approved += 1;
  }

  await recordAudit({
    eventId,
    actorId: user.id,
    actorName: user.name,
    action: 'ATTENDANCE',
    entity: 'EVENT_MEMBER',
    entityId: eventId,
    entityLabel: t.seatSetup.title,
    newValues: { approved },
    summary: `${t.seatSetup.title}: ${t.journey.approveSummary} ${approved}`,
  });

  for (const base of ['/admin', '/leader']) {
    revalidatePath(`${base}/events/${eventId}/seats`);
  }
  return ok();
}
