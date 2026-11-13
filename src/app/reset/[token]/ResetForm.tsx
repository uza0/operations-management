'use client';

import { useActionState } from 'react';
import Link from 'next/link';

import { completePasswordResetAction } from '@/server/actions/auth';
import { idle } from '@/server/actions/types';
import { FormError, Notice } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import type { Dictionary } from '@/lib/i18n';

/**
 * Two fields and nothing else. The person here cannot sign in, which is why
 * they are here, so the page asks for the one thing they came to do and then
 * points at the door.
 */
export function ResetForm({ t, token }: { t: Dictionary; token: string }) {
  const [state, action] = useActionState(completePasswordResetAction, idle);

  if (state.status === 'success') {
    return (
      <div className="space-y-4">
        <Notice tone="ok">{t.auth.resetDone}</Notice>
        <Link href="/login?next=/" className="btn-primary w-full">
          {t.auth.signIn}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
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
          dir="ltr"
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
          dir="ltr"
          minLength={8}
          required
        />
      </div>
      {state.status === 'error' ? <FormError message={state.message} /> : null}
      <SubmitButton className="btn-primary w-full">{t.auth.resetSave}</SubmitButton>
    </form>
  );
}
