'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { SETUP_STEPS, hrefForStep, stepFromParam } from './setup-steps';
import type { Dictionary } from '@/lib/i18n';

/**
 * The strip that walks a new event through being set up.
 *
 * It sits above the real screen rather than replacing it, so every step is the
 * page the supervisor will use for the rest of the event's life — nothing is
 * learned here that has to be unlearned later.
 *
 * Three ways out of every step, because they mean different things:
 *   • التالي  — done here, go on
 *   • تخطّي   — not now, go on anyway (gates are needed; a timeline is not)
 *   • إنهاء   — leave the walk-through; the event is a normal event again
 *
 * Plain links, no state: the position lives in the URL, so a refresh, a back
 * button or a link sent to a colleague all land in the same place.
 */
export function SetupWizard({
  t,
  base,
  eventId,
}: {
  t: Dictionary;
  base: '/admin' | '/leader';
  eventId: string;
}) {
  /*
   * The position comes from the URL rather than from state. A layout cannot
   * read search params on the server, and keeping it in the address bar is
   * better anyway: refreshing, going back, or sending the link to a colleague
   * all land on the same step.
   */
  const step = stepFromParam(useSearchParams().get('setup') ?? undefined);
  if (!step) return null;

  const current = SETUP_STEPS[step - 1];
  const labels = t.setup.steps as unknown as Record<string, string>;
  const last = step === SETUP_STEPS.length;
  const done = `${base}/events/${eventId}`;

  return (
    <section className="app-chrome panel mb-4 border-brand-500/40 bg-brand-500/10 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="nums text-[12px] font-semibold uppercase tracking-wide text-brand-300">
            {t.setup.title} · {step} / {SETUP_STEPS.length}
          </p>
          <h2 className="mt-0.5 text-[16px] font-semibold text-ink-100">
            {labels[current.label]}
          </h2>
          <p className="mt-0.5 text-[12.5px] leading-5 text-ink-400">
            {labels[current.hint]}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {step > 1 ? (
            <Link href={hrefForStep(base, eventId, step - 1)} className="btn-ghost btn-sm">
              {t.setup.back}
            </Link>
          ) : null}

          {last ? (
            <Link href={done} className="btn-primary btn-sm">
              {t.setup.finish}
            </Link>
          ) : (
            <>
              <Link href={hrefForStep(base, eventId, step + 1)} className="btn-ghost btn-sm">
                {t.setup.skip}
              </Link>
              <Link href={hrefForStep(base, eventId, step + 1)} className="btn-primary btn-sm">
                {t.setup.next}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Where he is, at a glance. Each step is reachable directly: a walk is
          not a cage, and coming back to fix the gates should not mean
          starting again. */}
      <ol className="mt-3 flex flex-wrap gap-1.5 border-t border-brand-500/20 pt-3">
        {SETUP_STEPS.map((entry, index) => {
          const n = index + 1;
          const state =
            n === step ? 'current' : n < step ? 'past' : 'future';
          return (
            <li key={entry.key}>
              <Link
                href={hrefForStep(base, eventId, n)}
                aria-current={state === 'current' ? 'step' : undefined}
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-[12.5px] transition sm:min-h-0 sm:px-2.5 sm:py-1 ${
                  state === 'current'
                    ? 'bg-brand-500 font-semibold text-ink-950'
                    : state === 'past'
                      ? 'bg-brand-500/20 text-brand-300'
                      : 'bg-ink-800 text-ink-400 hover:text-ink-200'
                }`}
              >
                <span className="nums">{n}</span>
                {labels[entry.label]}
              </Link>
            </li>
          );
        })}
      </ol>

      <p className="mt-1 text-[12.5px] text-ink-500">
        <Link
          href={done}
          className="inline-flex min-h-[40px] items-center underline hover:text-ink-300 sm:min-h-0"
        >
          {t.setup.exit}
        </Link>
      </p>
    </section>
  );
}
