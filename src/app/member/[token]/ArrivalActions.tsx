'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import {
  reportArrivalAction,
  reportDepartureAction,
} from '@/server/actions/journey';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { ConfirmSubmit, SubmitButton } from '@/components/ui/client';
import type { Dictionary } from '@/lib/i18n';

/**
 * "I'm here" and "I'm off" — one button, whichever belongs to the moment.
 *
 * Both are checked again on the server. The button that is not on the screen
 * is a courtesy; the refusal behind it is the rule.
 */
export function ArrivalButton({ t, token }: { t: Dictionary; token: string }) {
  const router = useRouter();
  const [state, action] = useActionState(reportArrivalAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="rise">
      <input type="hidden" name="token" value={token} />
      <SubmitButton className="btn-primary w-full py-3 text-[16px]">
        {t.journey.arrived}
      </SubmitButton>
      <p className="mt-1.5 text-center text-[12.5px] text-ink-500">{t.journey.arrivedHint}</p>
      <FormError message={state.status === 'error' ? state.message : null} />
    </form>
  );
}

export function DepartureButton({ t, token }: { t: Dictionary; token: string }) {
  const router = useRouter();
  const [state, action] = useActionState(reportDepartureAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      {/*
        Asked once before it is recorded: pressed by mistake in a pocket, it
        ends the evening on the supervisor's screen as well as on his own.
      */}
      <ConfirmSubmit className="btn-outline w-full" message={t.journey.departHint}>
        {t.journey.depart}
      </ConfirmSubmit>
      <FormError message={state.status === 'error' ? state.message : null} />
    </form>
  );
}
