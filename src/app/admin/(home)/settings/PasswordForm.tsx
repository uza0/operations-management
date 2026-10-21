'use client';

import { useActionState, useEffect, useRef } from 'react';

import { changePasswordAction } from '@/server/actions/auth';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import type { Dictionary } from '@/lib/i18n';

/**
 * Changing your own password.
 *
 * Deliberately the only account operation in the app: everything else about
 * who may sign in is decided once, outside it, but the password on a shipped
 * account has to be changeable by the person holding it.
 */
export function PasswordForm({ t }: { t: Dictionary }) {
  const [state, action] = useActionState(changePasswordAction, idle);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // Clear the fields on success — leaving a password sitting in a form on a
    // shared screen defeats the point of changing it.
    if (state.status === 'success') form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="space-y-3">
      <p className="text-[12.5px] leading-5 text-ink-500">{t.auth.changePasswordHint}</p>

      <div>
        <label className="field-label" htmlFor="currentPassword">
          {t.auth.currentPassword}
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          className="field"
          autoComplete="current-password"
          required
        />
      </div>

      <div>
        <label className="field-label" htmlFor="newPassword">
          {t.auth.newPassword}
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          className="field"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      <div>
        <label className="field-label" htmlFor="confirmPassword">
          {t.auth.confirmPassword}
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          className="field"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      {state.status === 'error' ? <FormError message={state.message} /> : null}
      {state.status === 'success' ? (
        <p className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-[13px] text-ok-text">
          {state.message ?? t.auth.passwordChanged}
        </p>
      ) : null}

      <SubmitButton className="btn-primary btn-sm w-full" pendingLabel={t.common.saving}>
        {t.auth.changePassword}
      </SubmitButton>
    </form>
  );
}
