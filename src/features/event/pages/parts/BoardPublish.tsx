'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { setBoardPublishedAction } from '@/server/actions/board';
import { idle } from '@/server/actions/types';
import { ConfirmSubmit } from '@/components/ui/client';
import { IconCheckCircle, IconEdit } from '@/components/ui/icons';
import type { Dictionary } from '@/lib/i18n';

/**
 * The switch between a board nobody can see and one everybody can.
 *
 * It is a banner rather than a button in the row of links, because its state
 * is the single most consequential fact on this screen: a supervisor who
 * thinks he has published and has not will spend the evening explaining to
 * people why their page is empty, and one who thinks he is still drafting
 * while every drag reaches thirty phones will spend it explaining the
 * opposite. So the strip says which of the two is true, in words, before it
 * offers the button that changes it.
 */
export function BoardPublish({
  t,
  eventId,
  published,
}: {
  t: Dictionary;
  eventId: string;
  published: boolean;
}) {
  const router = useRouter();
  const [state, action] = useActionState(setBoardPublishedAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form
      action={action}
      className={`mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border px-4 py-3 ${
        published
          ? 'border-ok/45 bg-ok/10'
          : 'border-warn/45 bg-warn/10'
      }`}
    >
      <input type="hidden" name="eventId" value={eventId} />
      {/* Submitting the opposite of what is on screen: one button, two jobs. */}
      <input type="hidden" name="published" value={published ? '0' : '1'} />

      <span
        className={`flex items-center gap-2 text-[13.5px] font-bold ${
          published ? 'text-ok-text' : 'text-warn-text'
        }`}
      >
        {published ? (
          <IconCheckCircle width={17} height={17} />
        ) : (
          <IconEdit width={17} height={17} />
        )}
        {published ? t.board.ready : t.board.draft}
      </span>

      <span className="min-w-0 flex-1 text-[13px] leading-5 text-ink-300">
        {published ? t.board.readyHint : t.board.draftHint}
      </span>

      <ConfirmSubmit
        className={published ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'}
        message={published ? t.board.unpublishConfirm : t.board.publishConfirm}
      >
        {published ? t.board.unpublish : t.board.publish}
      </ConfirmSubmit>
    </form>
  );
}
