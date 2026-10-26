'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  confirmInvitationAction,
  declineInvitationAction,
} from '@/server/actions/journey';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import { DECLINE_REASONS } from '@/lib/constants';
import { formatAmount } from '@/lib/money';
import { format, type Dictionary } from '@/lib/i18n';

/**
 * The first screen, and the only one with a question on it.
 *
 * It carries exactly what somebody needs to answer that question — what,
 * where, when, how long, what it pays — and nothing about gates or colleagues
 * or the board. Two reasons: the placement can still change before the night,
 * and a man who is about to say no has no business reading the team's
 * distribution.
 */
export function InvitationScreen({
  t,
  token,
  pay,
  currency,
  deadline,
  urgent,
  overdue,
}: {
  t: Dictionary;
  token: string;
  pay: number | null;
  currency: string;
  /** Already formatted: the server owns the clock, not the phone. */
  deadline: { left: string; at: string } | null;
  urgent: boolean;
  overdue: boolean;
}) {
  const router = useRouter();
  const [confirmState, confirm] = useActionState(confirmInvitationAction, idle);
  const [declineState, decline] = useActionState(declineInvitationAction, idle);
  const [declining, setDeclining] = useState(false);

  useEffect(() => {
    if (confirmState.status === 'success' || declineState.status === 'success') {
      router.refresh();
    }
  }, [confirmState, declineState, router]);

  return (
    <section className="rise rounded-card border border-brand-600/45 bg-brand-500/5 p-4">
      <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-brand-900">
        {t.journey.inviteTitle}
      </p>
      <p className="mt-1.5 text-[13px] leading-6 text-ink-300">{t.journey.inviteHint}</p>

      {pay !== null ? (
        <p className="nums mt-3 text-[15px] font-semibold text-ink-100">
          {formatAmount(pay)} {currency}
        </p>
      ) : null}

      {/*
        The deadline, as a span and as a date. A countdown alone is forgotten
        the moment the screen closes; a date alone does not convey urgency.
      */}
      <div className="mt-3 rounded-control border border-ink-700 bg-ink-850 px-3 py-2.5">
        {urgent ? (
          <p className="text-[13px] font-semibold text-warn-text">
            {t.journey.deadlineNone}
          </p>
        ) : overdue ? (
          <p className="text-[13px] font-semibold text-warn-text">
            {t.journey.deadlinePassed}
          </p>
        ) : deadline ? (
          <>
            <p className="text-[14px] font-semibold text-ink-100">
              {format(t.journey.deadline, { time: deadline.left })}
            </p>
            <p className="nums mt-0.5 text-[12.5px] text-ink-400">
              {format(t.journey.deadlineAt, { when: deadline.at })}
            </p>
          </>
        ) : null}
      </div>

      {declining ? (
        <form action={decline} className="mt-3 space-y-2.5">
          <input type="hidden" name="token" value={token} />
          <p className="field-label">{t.journey.declineWhy}</p>
          <div className="grid gap-1.5">
            {DECLINE_REASONS.map((reason) => (
              <label
                key={reason}
                className="flex min-h-[44px] items-center gap-2.5 rounded-control border border-ink-800 px-3 py-2 text-[13.5px] text-ink-200"
              >
                <input
                  type="radio"
                  name="reason"
                  value={reason}
                  className="h-4.5 w-4.5 accent-brand-500"
                />
                {t.enums.declineReason[reason]}
              </label>
            ))}
          </div>
          <FormError message={declineState.status === 'error' ? declineState.message : null} />
          <div className="flex gap-2">
            <SubmitButton className="btn-secondary btn-sm flex-1">
              {t.journey.decline}
            </SubmitButton>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setDeclining(false)}
            >
              {t.common.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3.5 space-y-2">
          <form action={confirm}>
            <input type="hidden" name="token" value={token} />
            <SubmitButton className="btn-primary w-full">{t.journey.confirm}</SubmitButton>
          </form>
          <button
            type="button"
            className="btn-outline w-full"
            onClick={() => setDeclining(true)}
          >
            {t.journey.decline}
          </button>
          <FormError message={confirmState.status === 'error' ? confirmState.message : null} />
        </div>
      )}
    </section>
  );
}
