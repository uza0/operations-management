'use client';

import { useActionState, useState } from 'react';

import { submitFeedbackAction } from '@/server/actions/member';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import {
  FEEDBACK_AGAIN,
  FEEDBACK_BRIEFINGS,
  FEEDBACK_DEGREES,
  FEEDBACK_PROBLEMS,
  FEEDBACK_RESPONSIBILITY,
  FEEDBACK_STAFFING,
  FEEDBACK_UNSURE,
} from '@/lib/constants';
import { format, type Dictionary } from '@/lib/i18n';

/**
 * The questionnaire the team answers once the evening is over.
 *
 * Five short screens rather than one long one. The whole thing is one form
 * element and every field stays mounted — the steps only decide what is
 * visible — so moving back and forth loses nothing, and what finally posts is
 * the complete set whichever screen the send button was pressed on.
 *
 * Only the four scores are required, and they are tapped, not typed: this is
 * filled in on a phone by somebody who has been on their feet since noon.
 * Every written answer is optional, because a form that will not send until
 * twenty boxes are full is a form abandoned at box eleven.
 */
const STEPS = 5;

export function FeedbackForm({
  t,
  token,
  answered,
}: {
  t: Dictionary;
  token: string;
  answered: boolean;
}) {
  const [state, action] = useActionState(submitFeedbackAction, idle);
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});

  const sent = state.status === 'success';

  if (answered || sent) {
    return (
      <section className="panel p-4">
        <h2 className="text-[15px] font-semibold text-ink-100">{t.feedback.done}</h2>
        <p className="mt-1.5 text-[13px] leading-6 text-ink-400">{t.feedback.doneHint}</p>
      </section>
    );
  }

  const setScore = (name: string, value: number) =>
    setScores((cur) => ({ ...cur, [name]: value }));

  /** The step cannot be left until its own scores are answered. */
  const needed: Record<number, string[]> = {
    0: ['instructionsClear'],
    1: ['organisation'],
    2: ['supportSpeed'],
    3: [],
    4: ['overall'],
  };
  const ready = (needed[step] ?? []).every((name) => scores[name]);

  return (
    <section className="panel p-4">
      <h2 className="text-[15px] font-semibold text-ink-100">{t.feedback.title}</h2>
      <p className="mt-1 text-[12.5px] leading-5 text-ink-500">{t.feedback.subtitle}</p>

      {/*
        The privacy promise, in full, before the first question rather than in
        small print under the last one. It is the reason the answers are worth
        reading, so it is the first thing read.
      */}
      <div className="mt-3 rounded-card border border-ink-700 bg-ink-850 p-3">
        <p className="text-[13px] font-semibold text-ink-200">{t.feedback.privacyTitle}</p>
        <p className="mt-1 text-[12.5px] leading-6 text-ink-400">{t.feedback.privacyBody}</p>
        <p className="mt-1.5 text-[12.5px] leading-6 text-ink-500">{t.feedback.privacyOnce}</p>
      </div>

      <div className="mt-3.5 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
          <div
            className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
            style={{ width: `${((step + 1) / STEPS) * 100}%` }}
          />
        </div>
        <span className="nums shrink-0 text-[12.5px] text-ink-500">
          {format(t.feedback.stepOf, { n: step + 1, total: STEPS })}
        </span>
      </div>

      <form action={action} className="mt-3.5 space-y-4">
        <input type="hidden" name="token" value={token} />
        {Object.entries(scores).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

        <Step show={step === 0} title={t.feedback.step1}>
          <Score t={t} label={t.feedback.qInstructions} value={scores.instructionsClear}
            onPick={(v) => setScore('instructionsClear', v)} />
          <Choice t={t} name="knewDuties" label={t.feedback.qKnewDuties}
            options={FEEDBACK_DEGREES} labels={t.enums.feedbackDegree} />
          <Choice t={t} name="briefingLength" label={t.feedback.qBriefing}
            options={FEEDBACK_BRIEFINGS} labels={t.enums.feedbackBriefing} />
        </Step>

        <Step show={step === 1} title={t.feedback.step2}>
          <Score t={t} label={t.feedback.qOrganisation} value={scores.organisation}
            onPick={(v) => setScore('organisation', v)} />
          <Choice t={t} name="staffing" label={t.feedback.qStaffing}
            options={FEEDBACK_STAFFING} labels={t.enums.feedbackStaffing} />
          <Choice t={t} name="distributionGood" label={t.feedback.qDistribution}
            options={FEEDBACK_DEGREES} labels={t.enums.feedbackDegree} />
          <Choice t={t} name="unsureMoments" label={t.feedback.qUnsure}
            options={FEEDBACK_UNSURE} labels={t.enums.feedbackUnsure} />
          <Note t={t} name="unsureWhy" label={t.feedback.qUnsureWhy} />
        </Step>

        <Step show={step === 2} title={t.feedback.step3}>
          <Choice t={t} name="knewWhoToAsk" label={t.feedback.qKnewWho}
            options={FEEDBACK_DEGREES} labels={t.enums.feedbackDegree} />
          <Score t={t} label={t.feedback.qSupportSpeed} value={scores.supportSpeed}
            onPick={(v) => setScore('supportSpeed', v)} />
          <Choice t={t} name="problemKind" label={t.feedback.qProblemKind}
            options={FEEDBACK_PROBLEMS} labels={t.enums.feedbackProblem} />
          <Note t={t} name="problemPrevention" label={t.feedback.qPrevention} />
        </Step>

        <Step show={step === 3} title={t.feedback.step4}>
          <Choice t={t} name="guestsInformed" label={t.feedback.qGuestsInformed}
            options={FEEDBACK_DEGREES} labels={t.enums.feedbackDegree} />
          <Note t={t} name="guestCommonIssue" label={t.feedback.qGuestIssue} />
          <Note t={t} name="guestImprovement" label={t.feedback.qGuestImprovement} />
        </Step>

        <Step show={step === 4} title={t.feedback.step5}>
          <Score t={t} label={t.feedback.qOverall} value={scores.overall}
            onPick={(v) => setScore('overall', v)} />
          <Note t={t} name="keepDoing" label={t.feedback.qKeepDoing} />
          <Note t={t} name="hardest" label={t.feedback.qHardest} />
          <Choice t={t} name="workAgain" label={t.feedback.qWorkAgain}
            options={FEEDBACK_AGAIN} labels={t.enums.feedbackAgain} />
          <Choice t={t} name="moreResponsibility" label={t.feedback.qResponsibility}
            options={FEEDBACK_RESPONSIBILITY} labels={t.enums.feedbackResponsibility} />
          <Note t={t} name="freeNote" label={t.feedback.qFreeNote} />
        </Step>

        <FormError message={state.status === 'error' ? state.message : null} />

        <div className="flex items-center gap-2 pt-1">
          {step > 0 ? (
            <button
              type="button"
              className="btn-outline btn-sm"
              onClick={() => setStep((s) => s - 1)}
            >
              {t.feedback.back}
            </button>
          ) : null}
          {step < STEPS - 1 ? (
            <button
              type="button"
              className="btn-primary btn-sm ms-auto"
              disabled={!ready}
              onClick={() => setStep((s) => s + 1)}
            >
              {t.feedback.next}
            </button>
          ) : (
            <span className="ms-auto">
              <SubmitButton className="btn-primary btn-sm" disabled={!ready}>
                {t.feedback.submit}
              </SubmitButton>
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

function Step({
  show,
  title,
  children,
}: {
  show: boolean;
  title: string;
  children: React.ReactNode;
}) {
  /*
   * Hidden, not unmounted. An unmounted step takes its answers with it, and
   * somebody who steps back to change one word would lose the other nineteen.
   */
  return (
    <div className={show ? 'rise space-y-4' : 'hidden'} aria-hidden={!show}>
      <p className="text-[13px] font-bold text-brand-900">{title}</p>
      {children}
    </div>
  );
}

/** One to five, as five big buttons — the only required kind of answer. */
function Score({
  t,
  label,
  value,
  onPick,
}: {
  t: Dictionary;
  label: string;
  value: number | undefined;
  onPick: (value: number) => void;
}) {
  return (
    <div>
      <p className="field-label">
        {label} <span className="text-crit-text">*</span>
      </p>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPick(n)}
            className={`press nums h-11 flex-1 rounded-control border text-[15px] font-bold transition ${
              value === n
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-ink-700 bg-ink-850 text-ink-300'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[12px] text-ink-600">
        <span>{t.feedback.scale1}</span>
        <span>{t.feedback.scale5}</span>
      </div>
    </div>
  );
}

/** A closed set of answers, as rows big enough to hit with a thumb. */
function Choice({
  t,
  name,
  label,
  options,
  labels,
}: {
  t: Dictionary;
  name: string;
  label: string;
  options: readonly string[];
  labels: Record<string, string>;
}) {
  const [picked, setPicked] = useState('');
  return (
    <div>
      <p className="field-label">
        {label} <span className="text-[12px] font-normal text-ink-600">{t.feedback.optional}</span>
      </p>
      <div className="grid gap-1.5">
        {options.map((option) => (
          <label
            key={option}
            className={`flex min-h-[44px] items-center gap-2.5 rounded-control border px-3 py-2 text-[13.5px] ${
              picked === option
                ? 'border-brand-500 bg-brand-500/10 text-ink-100'
                : 'border-ink-800 text-ink-200'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={picked === option}
              onChange={() => setPicked(option)}
              className="h-4.5 w-4.5 accent-brand-500"
            />
            {labels[option]}
          </label>
        ))}
      </div>
    </div>
  );
}

function Note({ t, name, label }: { t: Dictionary; name: string; label: string }) {
  return (
    <div>
      <label className="field-label" htmlFor={`fb-${name}`}>
        {label} <span className="text-[12px] font-normal text-ink-600">{t.feedback.optional}</span>
      </label>
      <textarea id={`fb-${name}`} name={name} rows={3} className="field" maxLength={1200} />
    </div>
  );
}
