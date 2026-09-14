'use client';

import { useActionState, useEffect, useState } from 'react';

import { loginAction } from '@/server/actions/auth';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import type { Dictionary } from '@/lib/i18n';

export function LoginForm({ t, next }: { t: Dictionary; next: string }) {
  const [state, action] = useActionState(loginAction, idle);

  /**
   * Sign-in runs through a React server action, so it does nothing until this
   * component is interactive. On a slow phone that window is real, and a
   * button that silently swallows the first tap is worse than one that is
   * visibly not ready yet.
   */
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <div>
        <label className="field-label" htmlFor="username">
          {t.auth.username}
        </label>
        <input
          id="username"
          name="username"
          className="field"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          dir="ltr"
          required
        />
      </div>

      <div>
        <label className="field-label" htmlFor="password">
          {t.auth.password}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="field"
          autoComplete="current-password"
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
        {ready ? t.auth.signIn : t.common.loading}
      </SubmitButton>
    </form>
  );
}
