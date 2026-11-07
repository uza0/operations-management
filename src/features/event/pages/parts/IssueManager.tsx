'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createIssueAction, updateIssueStatusAction } from '@/server/actions/operations';
import { idle } from '@/server/actions/types';
import { EmptyState, FormError } from '@/components/ui/states';
import { Badge, issuePriorityTone, issueStatusTone } from '@/components/ui/status';
import { Dialog, SubmitButton } from '@/components/ui/client';
import { IconAlert, IconPlus } from '@/components/ui/icons';
import {
  ISSUE_PRIORITIES,
  ISSUE_TYPES,
  type IssuePriority,
  type IssueStatus,
  type IssueType,
} from '@/lib/constants';
import { formatDateTime } from '@/lib/time';
import { format, type Dictionary } from '@/lib/i18n';
import { plural } from '@/lib/plural';

export type IssueRow = {
  id: string;
  type: string;
  description: string;
  priority: string;
  status: string;
  locationName: string | null;
  reporterName: string;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
  /** Who holds it now — not who eventually closed it. */
  assigneeName: string | null;
  dueAt: Date | null;
  /** Past its target with nobody having picked it up. */
  overdue: boolean;
  minutesLate: number;
  escalated: boolean;
  reopenCount: number;
};

type Option = { id: string; name: string };

const NEXT_STATUS: Record<IssueStatus, IssueStatus[]> = {
  OPEN: ['ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
};

function IssueForm({
  t,
  eventId,
  gates,
  workingPoints,
  onDone,
}: {
  t: Dictionary;
  eventId: string;
  gates: Option[];
  workingPoints: Option[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState(createIssueAction, idle);

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="i-type">
            {t.issue.issueType}
          </label>
          <select id="i-type" name="type" className="field" defaultValue="SCANNER">
            {ISSUE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t.enums.issueType[type as IssueType]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="i-priority">
            {t.issue.priority}
          </label>
          <select id="i-priority" name="priority" className="field" defaultValue="MEDIUM">
            {ISSUE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t.enums.issuePriority[p as IssuePriority]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="i-gate">
            {t.gate.gates} <span className="text-ink-500">({t.common.optional})</span>
          </label>
          <select id="i-gate" name="gateId" className="field" defaultValue="">
            <option value="">{t.common.none}</option>
            {gates.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="i-wp">
            {t.gate.workingPoints}{' '}
            <span className="text-ink-500">({t.common.optional})</span>
          </label>
          <select id="i-wp" name="workingPointId" className="field" defaultValue="">
            <option value="">{t.common.none}</option>
            {workingPoints.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="i-description">
          {t.common.description}
        </label>
        <textarea
          id="i-description"
          name="description"
          rows={4}
          className="field"
          required
          placeholder={t.issue.describeHint}
        />
      </div>

      {state.status === 'error' ? <FormError message={state.message} /> : null}

      <div className="flex justify-end">
        <SubmitButton pendingLabel={t.common.saving}>{t.common.create}</SubmitButton>
      </div>
    </form>
  );
}

function StatusActions({
  t,
  eventId,
  issue,
}: {
  t: Dictionary;
  eventId: string;
  issue: IssueRow;
}) {
  const router = useRouter();
  const [state, action] = useActionState(updateIssueStatusAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  const next = NEXT_STATUS[issue.status as IssueStatus] ?? [];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {next.map((status) => (
        <form key={status} action={action}>
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="issueId" value={issue.id} />
          <input type="hidden" name="status" value={status} />
          <SubmitButton
            className={status === 'RESOLVED' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
          >
            {status === 'ACKNOWLEDGED'
              ? t.issue.acknowledge
              : status === 'IN_PROGRESS'
                ? t.issue.start
                : status === 'RESOLVED'
                  ? t.issue.resolve
                  : status === 'CLOSED'
                    ? t.issue.closeIssue
                    : t.issue.reopen}
          </SubmitButton>
        </form>
      ))}
      {state.status === 'error' ? <FormError message={state.message} /> : null}
    </div>
  );
}

export function IssueManager({
  t,
  locale,
  eventId,
  issues,
  gates,
  workingPoints,
}: {
  t: Dictionary;
  locale: 'ar' | 'en';
  eventId: string;
  issues: IssueRow[];
  gates: Option[];
  workingPoints: Option[];
}) {
  const [creating, setCreating] = useState(false);

  const open = issues.filter((i) => !['RESOLVED', 'CLOSED'].includes(i.status));
  const closed = issues.filter((i) => ['RESOLVED', 'CLOSED'].includes(i.status));

  function card(issue: IssueRow) {
    const critical = issue.priority === 'CRITICAL' && issue.status === 'OPEN';
    return (
      <li
        key={issue.id}
        className={`panel p-4 ${critical ? 'border-crit/50' : ''} ${
          ['RESOLVED', 'CLOSED'].includes(issue.status) ? 'opacity-75' : ''
        }`}
      >
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-ink-100">
              {t.enums.issueType[issue.type as IssueType]}
            </h3>
            <p className="mt-0.5 text-[12px] text-ink-500">
              {issue.locationName ? `${issue.locationName} · ` : ''}
              {t.issue.reporter}: {issue.reporterName} ·{' '}
              <span className="nums">{formatDateTime(issue.createdAt, locale)}</span>
            </p>
            {/*
              Who owns it, said plainly. A report with no name against it is
              the one everybody assumes somebody else is handling, which is
              how a problem sits open for an hour with four people aware of it.
            */}
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
              <span className="text-ink-500">{t.issue.owner}:</span>
              {issue.assigneeName ? (
                <span className="font-semibold text-ink-200">{issue.assigneeName}</span>
              ) : (
                <span className="font-semibold text-warn-text">{t.issue.unassigned}</span>
              )}
              {issue.escalated ? (
                <Badge tone="warn" dot={false}>
                  {t.issue.escalated}
                </Badge>
              ) : null}
              {issue.reopenCount > 0 ? (
                <Badge tone="warn" dot={false}>
                  {format(t.issue.reopened, { n: issue.reopenCount })}
                </Badge>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {/*
              Late means nobody has picked it up — the clock stops at the
              acknowledgement, not at the fix. A problem that takes an hour to
              solve is not a failure; an hour of silence is.
            */}
            {issue.overdue ? (
              <Badge tone="crit" pulse>
                {plural(t.issue.lateBy, issue.minutesLate, locale)}
              </Badge>
            ) : null}
            <Badge tone={issuePriorityTone[issue.priority as IssuePriority]}>
              {t.enums.issuePriority[issue.priority as IssuePriority]}
            </Badge>
            <Badge
              tone={issueStatusTone[issue.status as IssueStatus]}
              pulse={issue.status === 'OPEN'}
            >
              {t.enums.issueStatus[issue.status as IssueStatus]}
            </Badge>
          </div>
        </div>

        <p className="text-[13.5px] leading-6 text-ink-300">{issue.description}</p>

        {issue.resolutionNote ? (
          <p className="mt-2 rounded-lg border border-ok/35 bg-ok/8 px-3 py-2 text-[12.5px] leading-5 text-ok-text">
            {t.issue.resolutionNote}: {issue.resolutionNote}
          </p>
        ) : null}

        {issue.resolvedAt ? (
          <p className="mt-2 text-[12.5px] text-ink-500">
            {t.issue.resolvedBy}: {issue.resolvedByName ?? '—'} ·{' '}
            <span className="nums">{formatDateTime(issue.resolvedAt, locale)}</span>
          </p>
        ) : null}

        <div className="mt-3 border-t border-ink-800 pt-3">
          <StatusActions t={t} eventId={eventId} issue={issue} />
        </div>
      </li>
    );
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
          <IconPlus width={16} height={16} />
          {t.issue.newIssue}
        </button>
      </div>

      {issues.length === 0 ? (
        <div className="panel">
          <EmptyState
            title={t.issue.empty}
            hint={t.issue.emptyHint}
            icon={<IconAlert width={20} height={20} />}
            action={
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={() => setCreating(true)}
              >
                {t.issue.newIssue}
              </button>
            }
          />
        </div>
      ) : (
        <div className="space-y-6">
          {open.length > 0 ? (
            <section>
              <h2 className="mb-2.5 text-[14px] font-semibold text-ink-200">
                {t.issue.openCount}{' '}
                <span className="nums text-ink-500">({open.length})</span>
              </h2>
              <ul className="space-y-3">{open.map(card)}</ul>
            </section>
          ) : null}

          {closed.length > 0 ? (
            <section>
              <h2 className="mb-2.5 text-[14px] font-semibold text-ink-200">
                {t.enums.issueStatus.RESOLVED}{' '}
                <span className="nums text-ink-500">({closed.length})</span>
              </h2>
              <ul className="space-y-3">{closed.map(card)}</ul>
            </section>
          ) : null}
        </div>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title={t.issue.newIssue}
        description={t.issue.subtitle}
      >
        <IssueForm
          t={t}
          eventId={eventId}
          gates={gates}
          workingPoints={workingPoints}
          onDone={() => setCreating(false)}
        />
      </Dialog>
    </>
  );
}
