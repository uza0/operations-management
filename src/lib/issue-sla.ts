import type { IssuePriority } from './constants';

/**
 * How long a report may sit unanswered before it is late.
 *
 * One number per priority, in minutes, and nothing else — because the moment
 * a board treats a medical call and a shortage of wristbands the same way, the
 * supervisor learns that red means nothing and stops looking at it. A low
 * priority report has no clock at all: it is a note, not a demand.
 *
 * These are the numbers the operation asked for. They live here so they can be
 * argued with in one place rather than guessed at in four.
 */
export const RESPONSE_TARGET_MINUTES: Record<IssuePriority, number | null> = {
  CRITICAL: 2,
  HIGH: 10,
  MEDIUM: 30,
  LOW: null,
};

/** When a report of this priority, raised now, becomes late. */
export function dueAtFor(priority: IssuePriority, from: Date = new Date()): Date | null {
  const minutes = RESPONSE_TARGET_MINUTES[priority];
  return minutes === null ? null : new Date(from.getTime() + minutes * 60_000);
}

/**
 * Is this report late, as of now?
 *
 * Late means "nobody has picked it up yet", not "nobody has fixed it yet": the
 * clock stops the moment a human acknowledges it, because from then on the
 * board can see who has it and what they have done. A problem that takes an
 * hour to solve is not a failure; an hour of silence is.
 */
export function isOverdue(issue: {
  status: string;
  dueAt: Date | null;
  acknowledgedAt: Date | null;
}, now: Date = new Date()): boolean {
  if (issue.acknowledgedAt) return false;
  if (issue.status !== 'OPEN') return false;
  return issue.dueAt !== null && issue.dueAt.getTime() < now.getTime();
}

/** Minutes late, for the board to put a number on it. */
export function minutesLate(dueAt: Date | null, now: Date = new Date()): number {
  if (!dueAt) return 0;
  return Math.max(0, Math.round((now.getTime() - dueAt.getTime()) / 60_000));
}
