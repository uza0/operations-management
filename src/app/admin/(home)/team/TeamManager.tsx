'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  deleteTeamMemberAction,
  saveTeamMemberAction,
  toggleTeamMemberAction,
} from '@/server/actions/team';
import { importTeamAction } from '@/server/actions/team';
import { idle } from '@/server/actions/types';
import { format } from '@/lib/i18n';
import { EmptyState, FormError } from '@/components/ui/states';
import { Badge } from '@/components/ui/status';
import { ConfirmSubmit, Dialog, SubmitButton } from '@/components/ui/client';
import {
  IconEdit,
  IconPlus,
  IconPrint,
  IconSearch,
  IconUpload,
  IconUsers,
} from '@/components/ui/icons';
import type { Dictionary } from '@/lib/i18n';
import { compareNames } from '@/lib/sort';

export type TeamRow = {
  id: string;
  fullName: string;
  phone: string | null;
  employeeCode: string;
  cardNumber: string | null;
  active: boolean;
  notes: string | null;
  eventCount: number;
};

function MemberForm({
  t,
  member,
  onDone,
}: {
  t: Dictionary;
  member?: TeamRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState(saveTeamMemberAction, idle);

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  return (
    <form action={action} className="space-y-4">
      {member ? <input type="hidden" name="memberId" value={member.id} /> : null}

      <div>
        <label className="field-label" htmlFor="fullName">
          {t.team.fullName}
        </label>
        <input
          id="fullName"
          name="fullName"
          className="field"
          required
          defaultValue={member?.fullName ?? ''}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="employeeCode">
            {t.team.employeeCode}
          </label>
          {member ? (
            /*
             * Shown, not editable. The code is what every assignment, report,
             * attendance line and audit entry in the system remembers this
             * person by, so changing it does not correct a record — it breaks
             * the thread between a man and his history. It is issued once and
             * then it is his.
             */
            <p className="field nums flex items-center text-ink-300" dir="ltr">
              {member.employeeCode}
            </p>
          ) : (
            /*
             * Adding someone asks for a name and nothing else that can be got
             * wrong: the code is issued by the server, in the roster's own
             * sequence, when the form is saved. Nothing is shown as a promise
             * here because two people could be added at the same moment and
             * only one of them can have the next number.
             */
            <p className="field flex items-center text-[13px] text-ink-500">
              {t.team.codeAutomatic}
            </p>
          )}
        </div>
        <div>
          <label className="field-label" htmlFor="phone">
            {t.team.phone}
          </label>
          <input
            id="phone"
            name="phone"
            className="field nums"
            type="tel"
            required
            dir="ltr"
            defaultValue={member?.phone ?? ''}
            placeholder="+9647XXXXXXXXX"
          />
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="cardNumber">
          {t.team.cardNumber} <span className="text-ink-500">({t.common.optional})</span>
        </label>
        <input
          id="cardNumber"
          name="cardNumber"
          className="field nums"
          dir="ltr"
          defaultValue={member?.cardNumber ?? ''}
          placeholder={t.team.cardNumberHint}
        />
      </div>

      <label className="flex items-center gap-2.5 text-[14px] text-ink-200">
        <input
          type="checkbox"
          name="active"
          defaultChecked={member ? member.active : true}
          className="h-4.5 w-4.5 accent-brand-500"
        />
        {t.team.active}
      </label>

      <p className="text-[12px] leading-5 text-ink-500">{t.team.minimalDataNote}</p>

      {state.status === 'error' ? <FormError message={state.message} /> : null}

      <div className="flex justify-end">
        <SubmitButton pendingLabel={t.common.saving}>{t.common.save}</SubmitButton>
      </div>
    </form>
  );
}

function RowActions({ t, member }: { t: Dictionary; member: TeamRow }) {
  const router = useRouter();
  const [toggleState, toggle] = useActionState(toggleTeamMemberAction, idle);
  const [deleteState, remove] = useActionState(deleteTeamMemberAction, idle);

  useEffect(() => {
    if (toggleState.status === 'success' || deleteState.status === 'success') {
      router.refresh();
    }
  }, [toggleState, deleteState, router]);

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <form action={toggle}>
        <input type="hidden" name="memberId" value={member.id} />
        <SubmitButton className="btn-ghost btn-sm">
          {member.active ? t.team.deactivate : t.team.activate}
        </SubmitButton>
      </form>
      {member.eventCount === 0 ? (
        <form action={remove}>
          <input type="hidden" name="memberId" value={member.id} />
          <ConfirmSubmit
            className="btn-ghost btn-sm text-crit-text"
            message={`${t.common.delete} — ${member.fullName}?`}
          >
            {t.common.delete}
          </ConfirmSubmit>
        </form>
      ) : null}
      {deleteState.status === 'error' ? (
        <span className="text-[12px] text-crit-text">{deleteState.message}</span>
      ) : null}
    </div>
  );
}

export function TeamManager({ t, members }: { t: Dictionary; members: TeamRow[] }) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [importing, setImporting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = q
      ? members.filter(
          (m) =>
            m.fullName.toLowerCase().includes(q) ||
            m.employeeCode.toLowerCase().includes(q) ||
            (m.phone ?? '').includes(q),
        )
      : members;
    /*
     * Alphabetical across both scripts — SQLite's own ORDER BY puts every
     * Latin name before every Arabic one, which on a roster that mixes them
     * reads as no order at all. See src/lib/sort.ts.
     */
    return [...matching].sort((a, b) => compareNames(a.fullName, b.fullName));
  }, [members, query]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <IconSearch
            width={16}
            height={16}
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-500 start-3"
          />
          <input
            className="field ps-9"
            placeholder={t.common.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t.common.search}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/*
           * Export first, then import: that is the order they are used in.
           * Nobody writes the spreadsheet from nothing — they take the one
           * the system already has and change it.
           */}
          <a href="/api/team/export" className="btn-ghost btn-sm">
            <IconPrint width={15} height={15} />
            {t.team.exportXlsx}
          </a>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setImporting(true)}
          >
            <IconUpload width={15} height={15} />
            {t.team.importXlsx}
          </button>
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <IconPlus width={16} height={16} />
            {t.team.newMember}
          </button>
        </div>
      </div>

      {importing ? <ImportDialog t={t} onClose={() => setImporting(false)} /> : null}

      <div className="panel">
        {filtered.length === 0 ? (
          <EmptyState
            title={members.length ? t.common.noResults : t.team.empty}
            hint={members.length ? undefined : t.team.emptyHint}
            icon={<IconUsers width={20} height={20} />}
            action={
              members.length ? null : (
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => setCreating(true)}
                >
                  {t.team.newMember}
                </button>
              )
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="op-table op-table-stack">
              <thead>
                <tr>
                  <th>{t.team.fullName}</th>
                  <th>{t.team.employeeCode}</th>
                  <th>{t.team.phone}</th>
                  <th>{t.team.eventsWorked}</th>
                  <th>{t.common.status}</th>
                  <th className="text-end">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((member) => (
                  <tr key={member.id}>
                    <td data-label="">
                      <button
                        type="button"
                        className="flex min-h-[44px] w-full items-center gap-2 text-start font-medium text-ink-100 hover:text-brand-300"
                        onClick={() => setEditing(member)}
                      >
                        <IconEdit width={14} height={14} className="text-ink-500" />
                        {member.fullName}
                      </button>
                    </td>
                    <td data-label={t.team.employeeCode} className="nums text-ink-300">
                      {member.employeeCode}
                    </td>
                    <td data-label={t.team.phone} className="nums text-ink-300">
                      {member.phone ?? '—'}
                    </td>
                    <td data-label={t.team.eventsWorked} className="nums text-ink-300">
                      {/*
                        The count is the way into the person's record — the
                        question that follows "how many events?" is always
                        "which ones, and what did they earn?".
                      */}
                      <Link
                        href={`/admin/team/${member.id}`}
                        className="-my-2.5 inline-flex min-h-[44px] items-center gap-1.5 py-2.5 hover:text-brand-300"
                      >
                        {member.eventCount}
                        <span className="text-[12px] text-ink-500">
                          {t.credit.memberLedger}
                        </span>
                      </Link>
                    </td>
                    <td data-label={t.common.status}>
                      <Badge tone={member.active ? 'ok' : 'neutral'}>
                        {member.active ? t.team.active : t.team.inactive}
                      </Badge>
                    </td>
                    <td data-label="">
                      <RowActions t={t} member={member} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title={t.team.newMember}
        description={t.team.subtitle}
      >
        <MemberForm t={t} onDone={() => setCreating(false)} />
      </Dialog>

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={t.team.editMember}
      >
        {editing ? (
          <MemberForm t={t} member={editing} onDone={() => setEditing(null)} />
        ) : null}
      </Dialog>
    </>
  );
}

/**
 * The upload side of the round trip.
 *
 * It reports per row rather than per file, because a file of sixty people
 * where two rows have no phone number should put fifty-eight people in the
 * roster and tell you about the two — refusing the whole upload over them
 * sends somebody back to Excel to hunt for rows a machine has already found.
 */
function ImportDialog({ t, onClose }: { t: Dictionary; onClose: () => void }) {
  const router = useRouter();
  const [state, action] = useActionState(importTeamAction, {
    status: 'idle' as const,
  });

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  const report = state.status === 'success' ? state.report : null;

  return (
    <Dialog open onClose={onClose} title={t.team.importTitle} description={t.team.importHint}>
      {report ? (
        <div className="space-y-3">
          <p className="rounded-control border border-ok/45 bg-ok/10 px-3 py-2.5 text-[13.5px] font-semibold text-ok-text">
            {format(t.team.importResult, {
              added: report.added,
              updated: report.updated,
              skipped: report.skipped,
            })}
          </p>

          {report.problems.length > 0 ? (
            <div>
              <p className="mb-1.5 text-[12.5px] font-bold text-ink-300">
                {t.team.importProblems}
              </p>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {report.problems.map((problem) => (
                  <li
                    key={`${problem.row}-${problem.name}`}
                    className="flex items-center justify-between gap-3 rounded-control border border-ink-800 px-2.5 py-1.5 text-[12.5px]"
                  >
                    <span className="min-w-0 truncate text-ink-200">
                      <span className="nums text-ink-500">{problem.row}</span>{' '}
                      {problem.name}
                    </span>
                    <span className="shrink-0 text-warn-text">{problem.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <button type="button" className="btn-primary btn-sm w-full" onClick={onClose}>
            {t.common.close}
          </button>
        </div>
      ) : (
        <form action={action} className="space-y-3">
          <div>
            <label className="field-label" htmlFor="file">
              {t.team.importFile}
            </label>
            <input
              id="file"
              name="file"
              type="file"
              required
              accept=".xlsx,.csv,text/csv"
              className="field"
            />
          </div>
          <FormError message={state.status === 'error' ? state.message : null} />
          <SubmitButton className="btn-primary btn-sm w-full">
            {t.team.importRun}
          </SubmitButton>
        </form>
      )}
    </Dialog>
  );
}
