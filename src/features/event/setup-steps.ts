/**
 * The order an event is actually built in.
 *
 * A freshly created event is a name and a date and nothing else, and the
 * screens that fill it in have a strict dependency order — there is nothing to
 * distribute before there are gates, and nobody to distribute before there is
 * a team. A supervisor who knows the system does this in the right order out
 * of habit; one who does not opens the distribution board first, finds it
 * empty, and concludes the system is broken.
 *
 * So the steps are walked rather than discovered. Each one is the REAL screen,
 * not a copy of it inside a wizard: whatever is learned here is where the work
 * is done afterwards, and a step skipped leaves nothing half-built behind.
 */

export type SetupStep = {
  key: string;
  /** Appended to `${base}/events/${id}`. The empty string is the overview. */
  path: string;
  /** Key under `t.setup.steps`. */
  label: string;
  hint: string;
};

export const SETUP_STEPS: SetupStep[] = [
  { key: 'gates', path: '/gates', label: 'gates', hint: 'gatesHint' },
  { key: 'team', path: '/team', label: 'team', hint: 'teamHint' },
  { key: 'board', path: '/board', label: 'board', hint: 'boardHint' },
  { key: 'timeline', path: '/timeline', label: 'timeline', hint: 'timelineHint' },
  { key: 'notify', path: '/notify', label: 'notify', hint: 'notifyHint' },
];

/** 1-based, clamped. Anything unparseable means "not in the walk-through". */
export function stepFromParam(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > SETUP_STEPS.length) return null;
  return n;
}

export function hrefForStep(base: string, eventId: string, step: number): string {
  const entry = SETUP_STEPS[step - 1];
  return `${base}/events/${eventId}${entry.path}?setup=${step}`;
}
