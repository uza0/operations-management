import { momentOfBaghdad } from '@/lib/time';
import type { EventStatus } from '@/lib/constants';

/**
 * What the screens call an evening, which is not always what is stored.
 *
 * One case, and it exists because the stored answer has to stay wrong for a
 * good reason. An evening whose attendance nobody finished marking cannot be
 * moved to COMPLETED — that is the moment every unmarked person becomes a
 * zero and every marked one becomes money owed — so it stays LIVE, and every
 * figure in the system that depends on "not settled yet" stays true.
 *
 * But a badge reading "جارية" three days after the hall emptied is the
 * dashboard repeating a lie all week. So the label is worked out from the
 * clock while the record is left alone: nothing moves, nothing is migrated,
 * and the screen stops insisting the night is still going on.
 */
export type DisplayStage = EventStatus | 'NEEDS_CLOSING';

/** The moment an evening's work ended, and the grace it is given after it. */
export function endedAt(event: {
  date: string;
  startTime: string;
  teamDepartureTime?: string | null;
}): { ended: number; grace: number } {
  const clock = event.teamDepartureTime || event.startTime;
  const crossesMidnight = Boolean(
    event.teamDepartureTime && event.teamDepartureTime < event.startTime,
  );
  return {
    ended: momentOfBaghdad(event.date, clock, crossesMidnight ? 1 : 0),
    /*
     * Without a departure time the night is judged eight hours after it began
     * rather than two after it ended — generous on purpose, because calling a
     * running event over is the one mistake this must not make.
     */
    grace: event.teamDepartureTime ? 2 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000,
  };
}

export function displayStage(event: {
  status: string;
  date: string;
  startTime: string;
  teamDepartureTime?: string | null;
}, now = Date.now()): DisplayStage {
  if (event.status !== 'LIVE') return event.status as EventStatus;

  const { ended, grace } = endedAt(event);
  return ended + grace <= now ? 'NEEDS_CLOSING' : 'LIVE';
}
