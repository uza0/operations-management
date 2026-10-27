'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { memberPanicAction } from '@/server/actions/member';
import { idle } from '@/server/actions/types';
import { FormError, Notice } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import { IconAlert } from '@/components/ui/icons';
import type { Dictionary } from '@/lib/i18n';

/**
 * The one button on the page that is meant to be pressed without reading it.
 *
 * Big, red, and at the top of the evening's screen rather than at the bottom
 * with the forms — a man holding a barrier with one hand is not scrolling.
 * It asks once before it goes, because an alarm raised in a pocket costs a
 * supervisor a walk across a stadium; the confirmation is the only friction,
 * and the reason line underneath is optional on purpose.
 */
export function PanicButton({ t, token }: { t: Dictionary; token: string }) {
  const router = useRouter();
  const [state, action] = useActionState(memberPanicAction, idle);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.status === 'success') {
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  if (state.status === 'success') {
    return <Notice tone="ok">{state.message}</Notice>;
  }

  return (
    <section className="rounded-card border border-crit/50 bg-crit/10 p-4">
      {open ? (
        <form action={action} className="space-y-2.5">
          <input type="hidden" name="token" value={token} />
          <p className="text-[14px] font-semibold text-ink-100">{t.member.panicConfirm}</p>
          <label className="field-label" htmlFor="panic-note">
            {t.member.panicNote}
          </label>
          <textarea
            id="panic-note"
            name="description"
            rows={2}
            className="field"
            maxLength={300}
          />
          <FormError message={state.status === 'error' ? state.message : null} />
          <div className="flex gap-2">
            <SubmitButton className="btn-danger flex-1 justify-center py-3 text-[15px]">
              {t.member.panicTitle}
            </SubmitButton>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </button>
          </div>
        </form>
      ) : (
        <>
          <button
            type="button"
            className="btn-danger w-full justify-center py-4 text-[17px] font-extrabold"
            onClick={() => setOpen(true)}
          >
            <IconAlert width={20} height={20} />
            {t.member.panicTitle}
          </button>
          <p className="mt-2 text-center text-[12.5px] leading-5 text-ink-400">
            {t.member.panicHint}
          </p>
        </>
      )}
    </section>
  );
}
