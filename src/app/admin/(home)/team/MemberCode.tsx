'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  issueMemberCodeAction,
  revokeMemberCodeAction,
  signOutMemberEverywhereAction,
} from '@/server/actions/team';
import { idle } from '@/server/actions/types';
import { Badge } from '@/components/ui/status';
import { SubmitButton } from '@/components/ui/client';
import { FormError } from '@/components/ui/states';
import { format, type Dictionary } from '@/lib/i18n';

/**
 * One person's sign-in code, from the roster.
 *
 * The code appears exactly once, here, straight after it is issued — long
 * enough to be copied into a message and no longer. There is no "show code"
 * anywhere in the system, because the system does not have it: what it keeps
 * is a hash.
 *
 * Which is why the whole message is offered beside it rather than the four
 * digits alone. Handing somebody a code and leaving him to write out the
 * installing, the signing in and the notifications a hundred and twenty times
 * is how the second half of that gets dropped by the twentieth person — and a
 * promoter who installed the app and never turned notifications on is a
 * promoter the app cannot reach.
 *
 * Built here, in the browser, from the code that is on the screen. It cannot
 * be built anywhere else: by the time any server could be asked for it, the
 * only copy of the code is the one in front of whoever just pressed the
 * button.
 */
export function MemberCode({
  t,
  memberId,
  name,
  whatsapp,
  appUrl,
  hasCode,
  sessions,
}: {
  t: Dictionary;
  memberId: string;
  name: string;
  /** Digits only, international — null when his number cannot be dialled. */
  whatsapp: string | null;
  appUrl: string;
  hasCode: boolean;
  sessions: number;
}) {
  const router = useRouter();
  const [issueState, issue] = useActionState(issueMemberCodeAction, idle);
  const [revokeState, revoke] = useActionState(revokeMemberCodeAction, idle);
  const [outState, signOutAll] = useActionState(signOutMemberEverywhereAction, idle);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (issueState.status === 'success' && issueState.message) {
      setCode(issueState.message);
      router.refresh();
    }
  }, [issueState, router]);

  useEffect(() => {
    if (revokeState.status === 'success' || outState.status === 'success') {
      setCode(null);
      router.refresh();
    }
  }, [revokeState, outState, router]);

  const invite = (issued: string) =>
    format(t.memberAuth.inviteMessage, { name, code: issued, link: appUrl });

  const error =
    issueState.status === 'error'
      ? issueState.message
      : revokeState.status === 'error'
        ? revokeState.message
        : outState.status === 'error'
          ? outState.message
          : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={hasCode ? 'ok' : 'neutral'}>
          {hasCode ? t.memberAuth.hasCode : t.memberAuth.noCodeYet}
        </Badge>
        {sessions > 0 ? (
          <span className="nums text-[12px] text-ink-500">
            {sessions} {t.memberAuth.devices}
          </span>
        ) : null}
      </div>

      {code ? (
        <div className="rounded-card border border-brand-600/50 bg-brand-600/10 p-3 text-center">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">
            {t.memberAuth.codeIssued}
          </p>
          <p className="nums my-1 text-[30px] font-bold tracking-[0.3em] text-ink-100" dir="ltr">
            {code}
          </p>
          <p className="text-[12px] leading-5 text-ink-400">{t.memberAuth.codeIssuedHint}</p>

          {/*
            And the message it belongs in, ready to send. Both roads lead to
            the same text: WhatsApp directly when we can dial him, and the
            clipboard when we cannot — or when whoever is doing this would
            rather paste it somewhere else.
          */}
          <div className="mt-3 flex flex-wrap justify-center gap-2 border-t border-brand-600/30 pt-3">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(invite(code));
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 4000);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? t.memberAuth.inviteCopied : t.memberAuth.inviteCopy}
            </button>

            {whatsapp ? (
              <a
                className="btn-primary btn-sm"
                href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(invite(code))}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.memberAuth.inviteSend}
              </a>
            ) : (
              <span className="self-center text-[12px] text-ink-500">
                {t.memberAuth.inviteNoPhone}
              </span>
            )}
          </div>
          <p className="mt-2 text-[11.5px] leading-5 text-ink-500">
            {t.memberAuth.inviteHint}
          </p>
        </div>
      ) : null}

      <FormError message={error} />

      <div className="flex flex-wrap gap-2">
        <form action={issue}>
          <input type="hidden" name="memberId" value={memberId} />
          <SubmitButton className="btn-ghost btn-sm" pendingLabel={t.common.saving}>
            {hasCode ? t.memberAuth.reissueCode : t.memberAuth.issueCode}
          </SubmitButton>
        </form>

        {hasCode ? (
          <form action={revoke}>
            <input type="hidden" name="memberId" value={memberId} />
            <SubmitButton className="btn-ghost btn-sm" pendingLabel={t.common.saving}>
              {t.memberAuth.revokeCode}
            </SubmitButton>
          </form>
        ) : null}

        {sessions > 0 ? (
          <form action={signOutAll}>
            <input type="hidden" name="memberId" value={memberId} />
            <SubmitButton className="btn-ghost btn-sm" pendingLabel={t.common.saving}>
              {t.memberAuth.signOutAll}
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </div>
  );
}
