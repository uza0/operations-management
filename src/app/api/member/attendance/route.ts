import { NextResponse } from 'next/server';

import {
  reportArrivalAction,
  reportDepartureAction,
  reportSeatArrivalAction,
  reportSeatDepartureAction,
} from '@/server/actions/journey';
import { idle } from '@/server/actions/types';

export const dynamic = 'force-dynamic';

/**
 * The offline outbox's way in.
 *
 * The same four actions the buttons call, behind an address that never
 * changes. A server action is reached by an id that belongs to one build: a
 * page saved for offline use before a deploy keeps calling the old id, and
 * after the deploy every retry fails — so an arrival saved in a stadium with
 * no signal stayed "waiting" for ever. This route has no build in its name.
 *
 * It grants nothing new: each action checks the member's own token exactly
 * as it does when called from the page.
 */
const ACTIONS = {
  EVENT_ARRIVAL: reportArrivalAction,
  EVENT_DEPARTURE: reportDepartureAction,
  SEAT_ARRIVAL: reportSeatArrivalAction,
  SEAT_DEPARTURE: reportSeatDepartureAction,
} as const;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ status: 'error', message: 'bad request' }, { status: 400 });
  }
  const kind = String(form.get('kind') ?? '') as keyof typeof ACTIONS;
  const action = ACTIONS[kind];
  if (!action) {
    return NextResponse.json({ status: 'error', message: 'bad kind' }, { status: 400 });
  }
  const result = await action(idle, form);
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
