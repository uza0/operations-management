'use client';

import { useActionState, useState } from 'react';

import { issuePasswordResetAction } from '@/server/actions/auth';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { CopyButton, Dialog, SubmitButton } from '@/components/ui/client';
import type { Dictionary } from '@/lib/i18n';

/**
 * Issues the link and shows it, once.
 *
 * In a dialog rather than in the row, because this is the only time the link
 * exists in the clear and it should not sit on a settings screen where the
 * next person to glance at the table can read it. Closing the dialog is the
 * end of it; a lost link is replaced by issuing another, which cancels this
 * one.
 */
export function ResetLinkButton({ t, userId }: { t: Dictionary; userId: string }) {
  const [state, action] = useActionState(issuePasswordResetAction, idle);
  const path = state.status === 'success' ? (state.message ?? '') : '';
  const link = path && typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;

  return (
    <>
      <form action={action}>
        <input type="hidden" name="userId" value={userId} />
        <SubmitButton className="btn-secondary btn-sm">{t.auth.resetLink}</SubmitButton>
      </form>
      {state.status === 'error' ? <FormError message={state.message} /> : null}
      <ResetLinkDialog key={path} t={t} link={link} />
    </>
  );
}

function ResetLinkDialog({ t, link }: { t: Dictionary; link: string }) {
  const [open, setOpen] = useState(Boolean(link));
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title={t.auth.resetLink}>
      <p className="text-[13px] leading-6 text-ink-300">{t.auth.resetLinkHint}</p>
      <input
        className="field mt-3 w-full text-[12.5px]"
        dir="ltr"
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="mt-3 flex justify-end">
        <CopyButton value={link} label={t.common.copy} copiedLabel={t.common.copied} className="btn-primary btn-sm" />
      </div>
    </Dialog>
  );
}
