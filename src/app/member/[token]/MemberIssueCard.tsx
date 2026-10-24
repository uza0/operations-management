'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { memberReopenIssueAction } from '@/server/actions/member';
import { idle } from '@/server/actions/types';
import { Badge } from '@/components/ui/status';
import { FormError } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import type { IssueStatus, IssueType } from '@/lib/constants';
import { format, type Dictionary } from '@/lib/i18n';

type Line = {
  id: string;
  type: string;
  status: string;
  description: string;
  /*
   * Already a string. A server component cannot hand a client component a
   * formatter — React refuses to serialise a function — and the clock format
   * is a locale decision the server has already made everywhere else on this
   * page, so it makes it here too.
   */
  acknowledgedLabel: string | null;
  resolutionNote: string | null;
  reopenCount: number;
  handlerName: string | null;
};

/**
 * One report, and what became of it.
 *
 * This is the half of the loop that decides whether this person reports
 * anything again. A status word alone does not do it: "resolved" by whom, and
 * what did they actually do? And if the problem is still standing in front of
 * them, saying so has to be a button, not a phone call — otherwise the next
 * problem goes to the WhatsApp group, where at least somebody answers.
 */
export function MemberIssueCard({
  t,
  token,
  line,
}: {
  t: Dictionary;
  token: string;
  line: Line;
}) {
  const router = useRouter();
  const [state, action] = useActionState(memberReopenIssueAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  const closed = line.status === 'RESOLVED' || line.status === 'CLOSED';

  return (
    <li className="panel px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13.5px] font-medium text-ink-100">
          {t.enums.issueType[line.type as IssueType]}
        </p>
        <Badge
          tone={closed ? 'ok' : line.status === 'OPEN' ? 'crit' : 'info'}
        >
          {t.enums.issueStatus[line.status as IssueStatus]}
        </Badge>
      </div>

      <p className="mt-1 text-[12.5px] leading-5 text-ink-400">{line.description}</p>

      {/* Who has it. A name is the difference between "reported" and "heard". */}
      {line.handlerName ? (
        <p className="mt-1.5 text-[12.5px] text-ink-300">
          <span className="text-ink-500">{t.member.handledBy}:</span>{' '}
          <span className="font-semibold">{line.handlerName}</span>
          {line.acknowledgedLabel ? (
            <span className="nums text-ink-500"> · {line.acknowledgedLabel}</span>
          ) : null}
        </p>
      ) : null}

      {line.resolutionNote ? (
        <p className="mt-1.5 rounded-lg bg-ok-soft px-2.5 py-1.5 text-[12.5px] leading-5 text-ok-text">
          <span className="font-semibold">{t.member.resolutionNote}:</span>{' '}
          {line.resolutionNote}
        </p>
      ) : null}

      {line.reopenCount > 0 ? (
        <p className="mt-1.5 text-[12px] text-warn-text">
          {format(t.member.reopenedBefore, { n: line.reopenCount })}
        </p>
      ) : null}

      {closed ? (
        <form action={action} className="mt-2">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="issueId" value={line.id} />
          <SubmitButton className="btn-secondary btn-sm w-full" pendingLabel={t.common.saving}>
            {t.member.stillHappening}
          </SubmitButton>
          <FormError message={state.status === 'error' ? state.message : null} />
        </form>
      ) : null}
    </li>
  );
}
