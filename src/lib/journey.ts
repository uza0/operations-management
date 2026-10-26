import type { AttendanceStatus, EventStatus } from './constants';

/**
 * Where one promoter is in one event.
 *
 * The page used to be the same page from the day the link was sent to the day
 * after the event: everything on it, all the time. This is the one function
 * that decides what he is being asked right now, and the page is a switch on
 * its answer.
 *
 * It is a product idea, not a column. Five names here are derived from three
 * facts that already exist — his answer to the invitation, the event's own
 * lifecycle, and whether a supervisor has confirmed he is here — because a
 * sixth state stored somewhere is a sixth state that can disagree with them.
 *
 * The order of the checks is the whole safety argument. Nothing about the
 * evening opens because a clock passed midnight; it opens because a person
 * with a radio said he was standing there.
 */
export type JourneyStage =
  /** The link has been sent; he has not answered. */
  | 'INVITED'
  /** He said no, or his place was given away. */
  | 'CLOSED'
  /** He said yes. This is the card he reopens until the day. */
  | 'CONFIRMED'
  /** Event day, inside the arrival window, nothing declared yet. */
  | 'ARRIVING'
  /** He pressed "I'm here"; a supervisor has not confirmed it. */
  | 'AWAITING_APPROVAL'
  /** Confirmed present. The tools for the night are open. */
  | 'ON_DUTY'
  /** He has gone, or the event is over: the questionnaire, then goodbye. */
  | 'AFTER';

export type JourneyFacts = {
  memberStatus: string;
  confirmedAt: Date | null;
  declinedAt: Date | null;
  eventStatus: EventStatus | string;
  attendanceStatus: AttendanceStatus | string | null;
  reportedArrivalAt: Date | null;
  approvedAt: Date | null;
  reportedDepartureAt: Date | null;
  /** The event's day and the hour the team is due, as stored: "YYYY-MM-DD", "HH:mm". */
  eventDate: string;
  teamArrivalTime: string;
  /** How early the "I'm here" button appears, in hours. */
  arrivalWindowHours: number;
  now: Date;
};

/** The house default: long enough to travel, short enough to mean today. */
export const ARRIVAL_WINDOW_HOURS = 2;

/** The house default for answering an invitation. */
export const RESPONSE_WINDOW_HOURS = 18;

/**
 * An invitation this close to the event cannot be given a real deadline, so
 * it is not given a fake one: it is marked urgent and handed to a human.
 */
export const MIN_PRE_EVENT_BUFFER_HOURS = 2;

/**
 * Baghdad time, as a moment.
 *
 * Every clock value in this system is stored as the wall clock somebody at
 * the venue would read — "17:30" means half past five there, whatever the
 * server thinks the hour is. A server in another timezone that compares those
 * strings to its own `now` is three hours wrong, which was once enough to
 * show a team arriving before they had set out.
 */
const VENUE_OFFSET = '+03:00';

export function venueMoment(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${VENUE_OFFSET}`);
}

/**
 * When the response deadline falls.
 *
 * The shorter of "the window from when it was sent" and "a safe margin before
 * the team is due" — because a deadline after the event has started asks a
 * question whose answer cannot matter. If the invitation went out so late
 * that the margin is already gone, there is no deadline at all: null, which
 * the leader's screen reads as urgent and as needing a phone call.
 */
export function responseDeadline(input: {
  notifiedAt: Date | null;
  eventDate: string;
  teamArrivalTime: string;
  windowHours: number;
  bufferHours?: number;
}): Date | null {
  if (!input.notifiedAt) return null;
  const buffer = input.bufferHours ?? MIN_PRE_EVENT_BUFFER_HOURS;
  const fromWindow = new Date(
    input.notifiedAt.getTime() + input.windowHours * 3_600_000,
  );
  const arrival = venueMoment(input.eventDate, input.teamArrivalTime);
  const latest = new Date(arrival.getTime() - buffer * 3_600_000);

  const deadline = fromWindow < latest ? fromWindow : latest;
  /* Already past at the moment it would be created: no deadline, a phone call. */
  return deadline.getTime() <= input.notifiedAt.getTime() ? null : deadline;
}

/** True once the deadline has gone by with no answer. */
export function isOverdue(input: {
  respondBy: Date | null;
  confirmedAt: Date | null;
  declinedAt: Date | null;
  now: Date;
}): boolean {
  if (input.confirmedAt || input.declinedAt) return false;
  if (!input.respondBy) return false;
  return input.respondBy.getTime() < input.now.getTime();
}

export function stageFor(facts: JourneyFacts): JourneyStage {
  /*
   * Closed first, and for two different reasons that look the same from the
   * outside: he said he could not come, or his place was given to somebody
   * else. Either way there is nothing left for him to do here.
   */
  if (facts.memberStatus === 'CANCELLED' || facts.declinedAt) return 'CLOSED';

  if (!facts.confirmedAt) return 'INVITED';

  /*
   * After. The event being finished ends it for everybody at once; his own
   * departure ends it for him. Both lead to the same screen, which is the
   * questionnaire and then goodbye.
   */
  if (
    facts.eventStatus === 'COMPLETED' ||
    facts.eventStatus === 'ARCHIVED' ||
    facts.reportedDepartureAt
  ) {
    return 'AFTER';
  }

  /*
   * On duty only once somebody confirmed it. Not because the hour arrived,
   * not because he pressed a button — because a supervisor who can see him
   * said yes. This is the line the whole stage machine exists to hold.
   */
  if (facts.approvedAt || facts.attendanceStatus === 'PRESENT' || facts.attendanceStatus === 'LATE') {
    return 'ON_DUTY';
  }

  if (facts.reportedArrivalAt) return 'AWAITING_APPROVAL';

  /* The button appears inside its window, and not a day before. */
  const due = venueMoment(facts.eventDate, facts.teamArrivalTime);
  const opens = new Date(due.getTime() - facts.arrivalWindowHours * 3_600_000);
  if (facts.now.getTime() >= opens.getTime()) return 'ARRIVING';

  return 'CONFIRMED';
}

/* -------------------------------------------------------------------------- */
/* The chair day                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The day before has a journey of its own, and it is deliberately the same
 * shape as the night's.
 *
 * It is a separate day's work for a separate fee, so being put on the crew
 * asks its own question and gets its own answer; and because the fee follows
 * attendance, turning up is settled the same way too — he says he is here,
 * somebody who can see him says so as well, and only that second sentence
 * decides whether the day is counted.
 *
 * What is NOT the same: there is no lateness here. The chairs are done when
 * they are done, people come as they can, and a minute counted against
 * somebody carrying seats across a hall would be a number invented to look
 * like management.
 */
export type SeatStage =
  | 'INVITED'
  | 'DECLINED'
  | 'CONFIRMED'
  | 'ARRIVING'
  | 'AWAITING_APPROVAL'
  | 'ON_DUTY'
  | 'DONE';

export type SeatFacts = {
  confirmedAt: Date | null;
  declinedAt: Date | null;
  reportedArrivalAt: Date | null;
  approvedAt: Date | null;
  reportedDepartureAt: Date | null;
  attended: boolean;
  /** "YYYY-MM-DD" and "HH:mm" — the shift's own day and hour. */
  date: string;
  startTime: string;
  arrivalWindowHours: number;
  now: Date;
};

export function seatStageFor(facts: SeatFacts): SeatStage {
  if (facts.declinedAt) return 'DECLINED';
  if (!facts.confirmedAt) return 'INVITED';
  if (facts.reportedDepartureAt) return 'DONE';
  if (facts.approvedAt || facts.attended) return 'ON_DUTY';
  if (facts.reportedArrivalAt) return 'AWAITING_APPROVAL';

  const due = venueMoment(facts.date, facts.startTime);
  const opens = new Date(due.getTime() - facts.arrivalWindowHours * 3_600_000);
  /*
   * And it closes at the end of that day. A shift nobody turned up to is over
   * once its day is, rather than leaving an "I'm here" button on a screen for
   * the rest of the month.
   */
  const closes = new Date(venueMoment(facts.date, '23:59').getTime());
  if (facts.now.getTime() > closes.getTime()) return 'DONE';
  if (facts.now.getTime() >= opens.getTime()) return 'ARRIVING';

  return 'CONFIRMED';
}
