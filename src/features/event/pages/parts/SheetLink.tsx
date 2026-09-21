'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { rotateBoardLinkAction } from '@/server/actions/board';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { CopyButton, SubmitButton } from '@/components/ui/client';
import type { Dictionary } from '@/lib/i18n';

/**
 * The public link to the distribution sheet.
 *
 * The sheet is the paper roster: names, gates, jobs. It is meant to be handed
 * around — pinned in the operations room, sent into the team's group, attached
 * to each member's briefing — so it is a link anyone can open rather than an
 * account anyone has to be given.
 *
 * What it deliberately does not carry: phone numbers, and the personal member
 * links. Those are per-person keys, and a sheet that spreads is the last place
 * they belong. Replacing the link revokes every copy already sent.
 */
export function SheetLink({
  t,
  eventId,
  token,
}: {
  t: Dictionary;
  eventId: string;
  token: string | null;
}) {
  const router = useRouter();
  const [state, action] = useActionState(rotateBoardLinkAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  const url =
    token && typeof window !== 'undefined' ? `${window.location.origin}/sheet/${token}` : '';

  return (
    <section className="panel mt-4 p-4">
      <h2 className="text-[15px] font-semibold text-ink-100">{t.board.shareTitle}</h2>
      <p className="mt-1 text-[12.5px] leading-5 text-ink-500">{t.board.shareHint}</p>

      {token ? (
        <div className="mt-3 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <code
              dir="ltr"
              className="min-w-0 flex-1 truncate rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 text-[12.5px] text-ink-300"
            >
              {url || `/sheet/${token}`}
            </code>
            <CopyButton value={url} label={t.common.copy} copiedLabel={t.common.copied} />
            <a href={`/sheet/${token}`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
              {t.board.openSheet}
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={action}>
              <input type="hidden" name="eventId" value={eventId} />
              <SubmitButton className="btn-ghost btn-sm">{t.board.newLink}</SubmitButton>
            </form>
            <form action={action}>
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="disable" value="1" />
              <SubmitButton className="btn-ghost btn-sm text-crit-text">
                {t.board.revokeLink}
              </SubmitButton>
            </form>
          </div>
          <p className="text-[12px] text-ink-500">{t.board.revokeHint}</p>
        </div>
      ) : (
        <form action={action} className="mt-3">
          <input type="hidden" name="eventId" value={eventId} />
          <SubmitButton className="btn-primary btn-sm">{t.board.createLink}</SubmitButton>
        </form>
      )}

      <FormError message={state.status === 'error' ? state.message : null} />
    </section>
  );
}
