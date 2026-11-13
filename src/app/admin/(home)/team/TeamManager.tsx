'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  deleteTeamMemberAction,
  saveTeamMemberAction,
  toggleTeamMemberAction,
} from '@/server/actions/team';
import { importTeamAction, toggleFavoriteAction } from '@/server/actions/team';
import { idle } from '@/server/actions/types';
import { format } from '@/lib/i18n';
import { EmptyState, FormError } from '@/components/ui/states';
import { Badge } from '@/components/ui/status';
import { MemberCode } from './MemberCode';
import { ConfirmSubmit, Dialog, SubmitButton } from '@/components/ui/client';
import {
  IconEdit,
  IconPlus,
  IconPrint,
  IconSearch,
  IconUpload,
  IconStar,
  IconUsers,
} from '@/components/ui/icons';
import type { Dictionary } from '@/lib/i18n';
import { compareNames } from '@/lib/sort';
import { TeamPhotoCell } from './TeamPhotoCell';

export type TeamRow = {
  id: string;
  fullName: string;
  phone: string | null;
  /** The same number, dialled — worked out on the server, null when unusable. */
  whatsapp?: string | null;
  employeeCode: string;
  cardNumber: string | null;
  photoUrl: string | null;
  pendingPhotoUrl: string | null;
  hasCode?: number;
  sessions?: number;
  active: boolean;
  salaried: boolean;
  favorite?: boolean;
  defaultPay: number | null;
  notes: string | null;
  eventCount: number;
};

type AttendanceLeader = {
  id: string;
  fullName: string;
  attendedEvents: number;
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

      <div>
        <label className="field-label" htmlFor="tm-pay">
          {t.team.defaultPay}
        </label>
        <input
          id="tm-pay"
          name="defaultPay"
          inputMode="numeric"
          className="field nums"
          defaultValue={member?.defaultPay != null ? String(member.defaultPay) : ''}
          placeholder={t.team.defaultPayPlaceholder}
        />
        <p className="mt-1 text-[12px] leading-5 text-ink-500">{t.team.defaultPayHint}</p>
      </div>

      {/*
        The rare case, and the reason it is a tick on the person rather than a
        figure on each event: a monthly contract is a fact about them, not
        about one night.
      */}
      <label className="flex items-start gap-2.5 text-[14px] text-ink-200">
        <input
          type="checkbox"
          name="salaried"
          defaultChecked={member ? member.salaried : false}
          className="mt-0.5 h-4.5 w-4.5 accent-brand-500"
        />
        <span>
          {t.credit.salaried}
          <span className="block text-[12px] leading-5 text-ink-500">
            {t.credit.salariedHint}
          </span>
        </span>
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
    <div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap max-sm:flex-wrap">
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

export function TeamManager({
  t,
  members,
  appUrl,
  attendanceLeaders,
  completedEventCount,
}: {
  t: Dictionary;
  members: TeamRow[];
  /** Where the app actually lives, for the invitation the roster writes. */
  appUrl: string;
  attendanceLeaders: AttendanceLeader[];
  completedEventCount: number;
}) {
  const [query, setQuery] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const favoriteCount = members.filter((m) => m.favorite).length;
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
    const shortlisted = onlyFavorites ? matching.filter((m) => m.favorite) : matching;
    /*
     * Alphabetical across both scripts — SQLite's own ORDER BY puts every
     * Latin name before every Arabic one, which on a roster that mixes them
     * reads as no order at all. See src/lib/sort.ts.
     */
    return [...shortlisted].sort((a, b) => compareNames(a.fullName, b.fullName));
  }, [members, query, onlyFavorites]);

  return (
    <>
      <section className="panel mb-4" aria-labelledby="attendance-leaders-title">
        <header className="panel-head">
          <div className="min-w-0">
            <h2 id="attendance-leaders-title" className="text-[15px] font-semibold text-ink-100">
              {t.team.attendanceLeaders}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-ink-400">{t.team.attendanceLeadersHint}</p>
          </div>
          {completedEventCount > 0 ? (
            <Badge tone="ok">{format(t.team.attendanceLeadersCount, { n: attendanceLeaders.length })}</Badge>
          ) : null}
        </header>
        {completedEventCount === 0 ? (
          <p className="px-4 py-5 text-[13.5px] text-ink-400">{t.team.attendanceNoCompletedEvents}</p>
        ) : attendanceLeaders.length === 0 ? (
          <p className="px-4 py-5 text-[13.5px] text-ink-400">{t.team.attendanceLeadersEmpty}</p>
        ) : (
          <ol className="grid max-h-[380px] grid-cols-1 gap-2 overflow-y-auto p-3 sm:grid-cols-2 xl:grid-cols-3">
            {attendanceLeaders.map((member, index) => {
              const rate = Math.round((member.attendedEvents / completedEventCount) * 100);
              return (
                <li key={member.id} className="rounded-card border border-ink-700 bg-ink-850/60 p-3">
                  <div className="flex items-center gap-2.5">
                    <span className="nums flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[12px] font-bold text-brand-900">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink-100">
                      {member.fullName}
                    </span>
                    <span className="nums shrink-0 text-[12.5px] font-semibold text-ok-text">
                      {member.attendedEvents} / {completedEventCount}
                    </span>
                  </div>
                  <div
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800"
                    role="progressbar"
                    aria-label={`${member.fullName}: ${member.attendedEvents} / ${completedEventCount}`}
                    aria-valuemin={0}
                    aria-valuemax={completedEventCount}
                    aria-valuenow={member.attendedEvents}
                  >
                    <span
                      className="block h-full rounded-full bg-ok"
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

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
        {/* The admin's own shortlist, one tap away from the whole roster. */}
        <button
          type="button"
          aria-pressed={onlyFavorites}
          onClick={() => setOnlyFavorites((v) => !v)}
          className={`btn-sm whitespace-nowrap ${onlyFavorites ? 'btn-secondary text-warn-text' : 'btn-ghost'}`}
        >
          <IconStar width={15} height={15} filled={onlyFavorites} />
          {format(t.team.favoritesCount, { n: favoriteCount })}
        </button>
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
                  <th>{t.memberAuth.photoTitle}</th>
                  <th>{t.team.fullName}</th>
                  <th>{t.team.employeeCode}</th>
                  <th>{t.team.phone}</th>
                  <th>{t.team.eventsWorked}</th>
                  <th>{t.common.status}</th>
                  <th>{t.memberAuth.code}</th>
                  <th className="text-end">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((member) => (
                  <tr key={member.id}>
                    <td data-label={t.memberAuth.photoTitle}><TeamPhotoCell member={member} labels={{ upload: member.photoUrl ? t.memberAuth.photoReplace : t.memberAuth.photoUpload, approve: t.memberAuth.photoApprove, pending: t.memberAuth.photoReview, error: t.memberAuth.photoUploadError }} /></td>
                    <td data-label="">
                      <div className="flex items-center gap-1">
                        <form action={toggleFavoriteAction}>
                          <input type="hidden" name="memberId" value={member.id} />
                          <button
                            type="submit"
                            className={`press -ms-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-ink-800 ${member.favorite ? 'text-warn-text' : 'text-ink-600 hover:text-ink-400'}`}
                            aria-pressed={Boolean(member.favorite)}
                            aria-label={member.favorite ? t.team.favoriteRemove : t.team.favoriteAdd}
                            title={member.favorite ? t.team.favoriteRemove : t.team.favoriteAdd}
                          >
                            <IconStar width={17} height={17} filled={Boolean(member.favorite)} />
                          </button>
                        </form>
                        <button
                          type="button"
                          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 text-start font-medium text-ink-100 hover:text-brand-300"
                          onClick={() => setEditing(member)}
                        >
                          <IconEdit width={14} height={14} className="text-ink-500" />
                          {member.fullName}
                        </button>
                      </div>
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
                    <td data-label={t.memberAuth.code}>
                      <MemberCode
                        t={t}
                        memberId={member.id}
                        name={member.fullName}
                        whatsapp={member.whatsapp ?? null}
                        appUrl={appUrl}
                        hasCode={Number(member.hasCode ?? 0) === 1}
                        sessions={Number(member.sessions ?? 0)}
                      />
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
