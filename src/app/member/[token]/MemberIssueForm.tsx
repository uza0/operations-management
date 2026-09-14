'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { memberReportIssueAction } from '@/server/actions/member';
import { idle } from '@/server/actions/types';
import { FormError, Notice } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import { IconAlert, IconClose } from '@/components/ui/icons';
import { ISSUE_PRIORITIES, ISSUE_TYPES, type IssuePriority, type IssueType } from '@/lib/constants';
import type { Dictionary } from '@/lib/i18n';

export function MemberIssueForm({ t, token }: { t: Dictionary; token: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(memberReportIssueAction, idle);

  useEffect(() => {
    if (state.status === 'success') {
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  if (!open) {
    return (
      <div className="space-y-2">
        {state.status === 'success' ? (
          <Notice tone="ok">
            <span className="font-semibold">{t.member.issueSent}</span> —{' '}
            {t.member.issueSentHint}
          </Notice>
        ) : null}
        <button
          type="button"
          className="btn-secondary w-full justify-center py-3.5 text-[15px]"
          onClick={() => setOpen(true)}
        >
          <IconAlert width={18} height={18} />
          {t.member.reportIssue}
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="panel space-y-3.5 p-4">
      <input type="hidden" name="token" value={token} />

      <div className="flex items-center justify-between">
        <p className="text-[14.5px] font-semibold text-ink-100">{t.issue.reportIssue}</p>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => setOpen(false)}
          aria-label={t.common.close}
        >
          <IconClose width={17} height={17} />
        </button>
      </div>

      <div>
        <label className="field-label" htmlFor="m-type">
          {t.issue.issueType}
        </label>
        <select id="m-type" name="type" className="field" defaultValue="SCANNER">
          {ISSUE_TYPES.map((type) => (
            <option key={type} value={type}>
              {t.enums.issueType[type as IssueType]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="field-label" htmlFor="m-priority">
          {t.issue.priority}
        </label>
        <select id="m-priority" name="priority" className="field" defaultValue="MEDIUM">
          {ISSUE_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {t.enums.issuePriority[p as IssuePriority]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="field-label" htmlFor="m-description">
          {t.common.description}
        </label>
        <textarea
          id="m-description"
          name="description"
          rows={4}
          className="field"
          required
          placeholder={t.issue.describeHint}
        />
      </div>

      {state.status === 'error' ? <FormError message={state.message} /> : null}

      <SubmitButton className="btn-primary w-full py-3.5" pendingLabel={t.common.saving}>
        {t.member.reportIssue}
      </SubmitButton>
    </form>
  );
}
