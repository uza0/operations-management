'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  confirmSeatSetupAction,
  declineSeatSetupAction,
} from '@/server/actions/journey';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { ConfirmSubmit, SubmitButton, useConfirm } from '@/components/ui/client';
import { DECLINE_REASONS } from '@/lib/constants';
import { formatAmount } from '@/lib/money';
import { format, type Dictionary } from '@/lib/i18n';
import { useOfflineAttendance } from './useOfflineAttendance';
import { OfflineAttendanceNotice } from './OfflineAttendanceNotice';

/**
 * One chair-setting day, asked and answered on its own.
 *
 * It sits inside the member's page rather than taking it over, because it is
 * never the only thing he was invited to: the event has its own question a
 * few centimetres above this one, and the two are answered separately. A man
 * who is free on Thursday afternoon and busy on Friday night says yes here
 * and no there, and the system has to be able to hear that.
 *
 * Dates and times arrive already formatted. The server owns the clock — at a
 * venue there is always one phone set to the wrong day.
 */
export function SeatSetupCard({
  t,
  token,
  seatMemberId,
  setupStatus,
  stage,
  arrivalWindowStartsAt,
  when,
  hours,
  notes,
  pay,
  currency,
  arrivedAt,
}: {
  t: Dictionary;
  token: string;
  seatMemberId: string;
  setupStatus: 'PLANNING' | 'READY';
  stage: 'INVITED' | 'DECLINED' | 'CONFIRMED' | 'ARRIVING' | 'AWAITING_APPROVAL' | 'ON_DUTY' | 'DONE';
  arrivalWindowStartsAt: number;
  when: string;
  hours: string;
  notes: string | null;
  pay: number;
  currency: string;
  /** Formatted clock time he said he arrived, when he has. */
  arrivedAt: string | null;
}) {
  const router = useRouter();
  const [confirmState, confirm] = useActionState(confirmSeatSetupAction, idle);
  const [declineState, decline] = useActionState(declineSeatSetupAction, idle);
  const [declining, setDeclining] = useState(false);
  const [arrivalWindowOpen, setArrivalWindowOpen] = useState(stage === 'ARRIVING');
  const [online, setOnline] = useState(true);
  const offline = useOfflineAttendance(token, t);
  const [ask, confirmDialog] = useConfirm();

  /* The question the two departure buttons below both ask. */
  const askThenDepart = async () => {
    if (await ask(t.journey.departHint)) void offline.record('SEAT_DEPARTURE', seatMemberId);
  };
  const pendingArrival = offline.pendingFor('SEAT_ARRIVAL', seatMemberId);
  const pendingDeparture = offline.pendingFor('SEAT_DEPARTURE', seatMemberId);

  useEffect(() => {
    if (
      confirmState.status === 'success' ||
      declineState.status === 'success'
    ) {
      router.refresh();
    }
  }, [confirmState, declineState, router]);

  useEffect(() => {
    if (stage === 'ARRIVING') {
      setArrivalWindowOpen(true);
      return;
    }
    if (stage !== 'CONFIRMED') {
      setArrivalWindowOpen(false);
      return;
    }
    const update = () => setArrivalWindowOpen(Date.now() >= arrivalWindowStartsAt);
    update();
    const delay = arrivalWindowStartsAt - Date.now();
    if (delay <= 0) return;
    const timer = window.setTimeout(update, delay);
    return () => window.clearTimeout(timer);
  }, [arrivalWindowStartsAt, stage]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const hidden = (
    <>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="seatMemberId" value={seatMemberId} />
    </>
  );

  return (
    <li className="rounded-control border border-ink-700 bg-ink-900 p-3.5">
      {confirmDialog}
      <p className="text-[16px] font-bold leading-tight text-ink-100">{when}</p>
      <p className={`mt-1 text-[12px] font-semibold ${setupStatus === 'READY' ? 'text-ok-text' : 'text-ink-400'}`}>
        {setupStatus === 'READY' ? t.seatSetup.memberReadyNotice : t.seatSetup.memberPlanningNotice}
      </p>
      <p className="nums mt-0.5 text-[14px] font-semibold text-ink-200">{hours}</p>
      {notes ? (
        <p className="mt-0.5 text-[12.5px] leading-5 text-ink-400">{notes}</p>
      ) : null}
      <p className="nums mt-1.5 text-[13.5px] font-semibold text-ink-100">
        {formatAmount(pay)} {currency}
      </p>

      {stage === 'INVITED' ? (
        declining ? (
          <form action={decline} className="mt-3 space-y-2.5">
            {hidden}
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
            <FormError
              message={declineState.status === 'error' ? declineState.message : null}
            />
            <div className="flex gap-2">
              <SubmitButton className="btn-secondary btn-sm flex-1">
                {t.seatSetup.decline}
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
          <div className="mt-3 space-y-2">
            <p className="text-[12.5px] leading-5 text-ink-400">{t.seatSetup.inviteHint}</p>
            <form action={confirm}>
              {hidden}
              <SubmitButton className="btn-primary w-full">
                {t.seatSetup.confirm}
              </SubmitButton>
            </form>
            <button
              type="button"
              className="btn-outline w-full"
              onClick={() => setDeclining(true)}
            >
              {t.seatSetup.decline}
            </button>
            <FormError
              message={confirmState.status === 'error' ? confirmState.message : null}
            />
          </div>
        )
      ) : null}

      {stage === 'DECLINED' ? (
        <div className="mt-2.5 rounded-control border border-ink-800 px-3 py-2.5">
          <p className="text-[13px] font-semibold text-ink-200">
            {t.seatSetup.declinedCard}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-5 text-ink-400">
            {t.seatSetup.declinedCardHint}
          </p>
        </div>
      ) : null}

      {stage === 'CONFIRMED' && !arrivalWindowOpen ? (
        <p className="mt-2.5 text-[12.5px] leading-5 text-ink-400">
          {t.seatSetup.arrivalHint}
        </p>
      ) : null}

      {stage === 'ARRIVING' || (stage === 'CONFIRMED' && arrivalWindowOpen) ? (
        <div className="mt-3 space-y-2">
          {pendingArrival ? (
            <OfflineAttendanceNotice
              t={t}
              action={pendingArrival}
              busy={offline.busy}
              onRetry={() => void offline.retry()}
            />
          ) : (
            <button
              type="button"
              className="btn-primary w-full py-3 text-[15px]"
              disabled={offline.busy}
              onClick={() => void offline.record('SEAT_ARRIVAL', seatMemberId)}
            >
              {offline.busy ? t.common.saving : t.journey.arrived}
            </button>
          )}
          <p className="mt-1.5 text-center text-[12px] text-ink-500">
            {t.seatSetup.paidWhenApproved}
          </p>
          <FormError message={offline.error} />
        </div>
      ) : null}

      {stage === 'AWAITING_APPROVAL' ? (
        <>
          <p className="mt-2.5 rounded-control border border-warn/40 bg-warn/10 px-3 py-2.5 text-[13px] font-semibold text-ink-100">
            {format(t.journey.arrivalWaiting, { time: arrivedAt ?? '' })}
          </p>
          {!online ? (
            <div className="mt-3 space-y-2">
              {pendingDeparture ? (
                <OfflineAttendanceNotice
                  t={t}
                  action={pendingDeparture}
                  busy={offline.busy}
                  onRetry={() => void offline.retry()}
                />
              ) : (
                <button
                  type="button"
                  className="btn-outline w-full"
                  disabled={offline.busy}
                  onClick={() => void askThenDepart()}
                >
                  {offline.busy ? t.common.saving : t.journey.depart}
                </button>
              )}
              <p className="text-center text-[12px] leading-5 text-ink-500">
                {t.pwa.offlineDepartureHint}
              </p>
            </div>
          ) : null}
        </>
      ) : null}

      {stage === 'ON_DUTY' ? (
        <div className="mt-3 space-y-2">
          {pendingDeparture ? (
            <OfflineAttendanceNotice
              t={t}
              action={pendingDeparture}
              busy={offline.busy}
              onRetry={() => void offline.retry()}
            />
          ) : (
            <button
              type="button"
              className="btn-outline w-full"
              disabled={offline.busy}
              onClick={() => void askThenDepart()}
            >
              {offline.busy ? t.common.saving : t.journey.depart}
            </button>
          )}
          <FormError message={offline.error} />
        </div>
      ) : null}
    </li>
  );
}
