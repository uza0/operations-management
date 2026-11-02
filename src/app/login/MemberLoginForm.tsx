'use client';

import { useActionState, useEffect, useState } from 'react';

import { memberSignInAction } from '@/server/actions/member-auth';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import type { Dictionary } from '@/lib/i18n';

import { SignInVeil } from './SignInVeil';

/**
 * The promoter's half of the sign-in page: a phone number and four digits.
 *
 * Two fields rather than one because they do different jobs. The phone is
 * something he knows without being told, and it is what makes guessing the
 * four digits useless — a stranger has to have both, for the same person.
 */
export function MemberLoginForm({ t }: { t: Dictionary }) {
  const [state, action] = useActionState(memberSignInAction, idle);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="field-label" htmlFor="m-phone">
          {t.memberAuth.phone}
        </label>
        <input
          id="m-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          className="field nums"
          autoComplete="tel"
          placeholder={t.memberAuth.phonePlaceholder}
          dir="ltr"
          required
        />
      </div>

      <div>
        <label className="field-label" htmlFor="m-code">
          {t.memberAuth.code}
        </label>
        <input
          id="m-code"
          name="code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          className="field nums text-center text-[22px] tracking-[0.5em]"
          autoComplete="one-time-code"
          placeholder={t.memberAuth.codePlaceholder}
          dir="ltr"
          required
        />
      </div>

      {state.status === 'error' ? <FormError message={state.message} /> : null}

      <SubmitButton
        className="btn-primary w-full"
        pendingLabel={t.auth.signingIn}
        disabled={!ready}
      >
        {ready ? t.memberAuth.submit : t.common.loading}
      </SubmitButton>

      <p className="text-center text-[12.5px] text-ink-500">{t.memberAuth.noCode}</p>

      <SignInVeil label={t.auth.signingIn} />
    </form>
  );
}
