'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  deleteTeamMemberAction,
  saveTeamMemberAction,
  toggleTeamMemberAction,
} from '@/server/actions/team';
import { idle } from '@/server/actions/types';
import { EmptyState, FormError } from '@/components/ui/states';
import { Badge } from '@/components/ui/status';
import { ConfirmSubmit, Dialog, SubmitButton } from '@/components/ui/client';
import { IconEdit, IconPlus, IconSearch, IconUsers } from '@/components/ui/icons';
import type { Dictionary } from '@/lib/i18n';

export type TeamRow = {
  id: string;
  fullName: string;
  phone: string | null;
  employeeCode: string;
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
          <input
            id="employeeCode"
            name="employeeCode"
            className="field nums"
            required
            dir="ltr"
            defaultValue={member?.employeeCode ?? ''}
            placeholder="TZ-1042"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="phone">
            {t.team.phone} <span className="text-ink-500">({t.common.optional})</span>
          </label>
          <input
            id="phone"
            name="phone"
            className="field nums"
            dir="ltr"
            defaultValue={member?.phone ?? ''}
            placeholder="+9647XXXXXXXXX"
          />
        </div>
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.fullName.toLowerCase().includes(q) ||
        m.employeeCode.toLowerCase().includes(q) ||
        (m.phone ?? '').includes(q),
    );
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
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
          <IconPlus width={16} height={16} />
          {t.team.newMember}
        </button>
      </div>

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
                      {member.eventCount}
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
