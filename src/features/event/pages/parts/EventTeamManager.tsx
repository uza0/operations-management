'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  addMembersToEventAction,
  deleteEventMemberAction,
  reinstateEventMemberAction,
  revokeEventMemberAction,
  rotateMemberTokenAction,
  updateEventMemberAction,
} from '@/server/actions/event-members';
import { idle } from '@/server/actions/types';
import { EmptyState, FormError, Notice } from '@/components/ui/states';
import { Badge } from '@/components/ui/status';
import {
  ConfirmSubmit,
  CopyButton,
  Dialog,
  SubmitButton,
} from '@/components/ui/client';
import {
  IconPlus,
  IconQr,
  IconRefresh,
  IconSearch,
  IconStar,
  IconTrash,
  IconUsers,
} from '@/components/ui/icons';
import { EVENT_MEMBER_STATUSES, type EventMemberStatus } from '@/lib/constants';
import { format, type Dictionary } from '@/lib/i18n';
import { byStatusThenName } from '@/lib/sort';

export type EventTeamRow = {
  id: string;
  name: string;
  employeeCode: string;
  phone: string | null;
  status: string;
  isReserve: boolean;
  token: string;
  locationName: string | null;
  qrDataUrl: string | null;
};

export type AvailablePerson = {
  id: string;
  name: string;
  employeeCode: string;
  /** The admin's shortlist; always false for anybody else looking. */
  favorite?: boolean;
};

function AddMembers({
  t,
  eventId,
  people,
  onDone,
}: {
  t: Dictionary;
  eventId: string;
  people: AvailablePerson[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState(addMembersToEventAction, idle);
  const [query, setQuery] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const favoriteCount = people.filter((p) => p.favorite).length;

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  /*
   * The ticks are state rather than plain form fields now, because "select
   * all" has to be able to set them and because the header count has to know.
   * Hidden-while-filtered is deliberately NOT how this works: a person ticked,
   * then filtered out by a later search, stays ticked and is still added —
   * losing a choice because the search box was typed in afterwards is how
   * someone silently goes missing from an event.
   */
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = q
      ? people.filter(
          (p) =>
            p.name.toLowerCase().includes(q) || p.employeeCode.toLowerCase().includes(q),
        )
      : people;
    /*
     * The starred first, so on a big night the people the admin wants beside
     * the new faces are at the top of the list; the order within each group
     * stays the alphabetical one it arrived in.
     */
    const shortlisted = onlyFavorites ? matching.filter((p) => p.favorite) : matching;
    return [...shortlisted].sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)));
  }, [people, query, onlyFavorites]);

  if (people.length === 0) {
    return <EmptyState title={t.common.noResults} hint={t.team.emptyHint} />;
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />

      <div className="relative">
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

      {favoriteCount > 0 ? (
        <button
          type="button"
          aria-pressed={onlyFavorites}
          onClick={() => setOnlyFavorites((v) => !v)}
          className={`btn-sm ${onlyFavorites ? 'btn-secondary text-warn-text' : 'btn-ghost'}`}
        >
          <IconStar width={15} height={15} filled={onlyFavorites} />
          {format(t.team.favoritesCount, { n: favoriteCount })}
        </button>
      ) : null}

      {/*
        Select all, over whatever the search has left. Adding a whole roster to
        an event is the normal first move of setting one up — the exception is
        leaving someone out, not putting everyone in — and ticking ninety-odd
        boxes to express "everyone" is work the screen should be doing.
      */}
      <div className="flex items-center justify-between gap-3 px-1">
        <label className="press flex min-h-[44px] cursor-pointer items-center gap-2.5 text-[13.5px] font-semibold text-ink-200 sm:min-h-0">
          <input
            type="checkbox"
            className="h-4.5 w-4.5 accent-brand-500"
            checked={filtered.length > 0 && filtered.every((p) => picked.has(p.id))}
            ref={(el) => {
              // The in-between state: some of this list is ticked, not all.
              if (el) {
                const mine = filtered.filter((p) => picked.has(p.id)).length;
                el.indeterminate = mine > 0 && mine < filtered.length;
              }
            }}
            onChange={(e) =>
              setPicked((current) => {
                const next = new Set(current);
                for (const person of filtered) {
                  if (e.target.checked) next.add(person.id);
                  else next.delete(person.id);
                }
                return next;
              })
            }
          />
          {t.board.selectAll}
        </label>
        {picked.size > 0 ? (
          <span className="nums text-[12.5px] text-ink-500">
            {format(t.board.selectedCount, { n: picked.size })}
          </span>
        ) : null}
      </div>

      <div className="max-h-[320px] space-y-1 overflow-y-auto rounded-lg border border-ink-700 p-2">
        {filtered.map((person) => (
          <label
            key={person.id}
            className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-ink-850 sm:min-h-0"
          >
            <input
              type="checkbox"
              name="memberIds"
              value={person.id}
              className="h-4.5 w-4.5 accent-brand-500"
              checked={picked.has(person.id)}
              onChange={(e) =>
                setPicked((current) => {
                  const next = new Set(current);
                  if (e.target.checked) next.add(person.id);
                  else next.delete(person.id);
                  return next;
                })
              }
            />
            <span className="flex flex-1 items-center gap-1.5 text-[14px] text-ink-100">
              {person.name}
              {person.favorite ? (
                <IconStar
                  width={14}
                  height={14}
                  filled
                  className="text-warn-text"
                  aria-label={t.team.favorite}
                />
              ) : null}
            </span>
            <span className="nums text-[12px] text-ink-500">{person.employeeCode}</span>
          </label>
        ))}
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13px] text-ink-500">
            {t.common.noResults}
          </p>
        ) : null}
      </div>

      <label className="flex items-center gap-2.5 text-[14px] text-ink-200">
        <input type="checkbox" name="isReserve" className="h-4.5 w-4.5 accent-brand-500" />
        {t.eventTeam.markReserve}
      </label>

      {state.status === 'error' ? <FormError message={state.message} /> : null}

      <div className="flex justify-end">
        <SubmitButton pendingLabel={t.common.saving}>
          {t.eventTeam.addSelected}
        </SubmitButton>
      </div>
    </form>
  );
}

function MemberActions({
  t,
  eventId,
  member,
}: {
  t: Dictionary;
  eventId: string;
  member: EventTeamRow;
}) {
  const router = useRouter();
  const [rotateState, rotate] = useActionState(rotateMemberTokenAction, idle);
  const [revokeState, revoke] = useActionState(revokeEventMemberAction, idle);
  const [updateState, update] = useActionState(updateEventMemberAction, idle);
  const [backState, putBack] = useActionState(reinstateEventMemberAction, idle);
  const [deleteState, remove] = useActionState(deleteEventMemberAction, idle);

  useEffect(() => {
    if (
      rotateState.status === 'success' ||
      revokeState.status === 'success' ||
      updateState.status === 'success' ||
      backState.status === 'success' ||
      deleteState.status === 'success'
    ) {
      router.refresh();
    }
  }, [rotateState, revokeState, updateState, backState, deleteState, router]);

  /*
   * A cancelled participant gets one button, and it is the way back. The rest
   * — reserve, rotate, cancel — are operations on somebody who is working the
   * event, and offering them here only invites a second mistake.
   */
  if (member.status === 'CANCELLED') {
    return (
      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
        <form action={putBack}>
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="eventMemberId" value={member.id} />
          <SubmitButton className="btn-secondary btn-sm">
            <IconRefresh width={14} height={14} />
            {t.eventTeam.reinstate}
          </SubmitButton>
        </form>
        <RemoveButton t={t} eventId={eventId} member={member} action={remove} />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
      <form action={update} className="flex items-center gap-1.5">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="eventMemberId" value={member.id} />
        <input type="hidden" name="isReserve" value={member.isReserve ? '' : 'on'} />
        <SubmitButton className="btn-ghost btn-sm">
          {member.isReserve ? t.eventTeam.unmarkReserve : t.eventTeam.markReserve}
        </SubmitButton>
      </form>

      <form action={rotate}>
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="eventMemberId" value={member.id} />
        <ConfirmSubmit
          className="btn-ghost btn-sm"
          message={t.eventTeam.rotateTokenConfirm}
        >
          <IconRefresh width={14} height={14} />
          {t.eventTeam.rotateToken}
        </ConfirmSubmit>
      </form>

      <form action={revoke} className="flex flex-col items-end">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="eventMemberId" value={member.id} />
        <ConfirmSubmit
          className="btn-ghost btn-sm text-crit-text"
          message={t.eventTeam.revokeConfirm}
        >
          {t.eventTeam.revoke}
        </ConfirmSubmit>
        {revokeState.status === 'error' ? (
          <span className="max-w-[200px] text-end text-[12.5px] leading-4 text-crit-text">
            {revokeState.message}
          </span>
        ) : null}
      </form>

      <RemoveButton t={t} eventId={eventId} member={member} action={remove} />
    </div>
  );
}

/**
 * The one button on this row that cannot be undone, so it says what it does
 * before it does it and is styled apart from the rest.
 */
function RemoveButton({
  t,
  eventId,
  member,
  action,
}: {
  t: Dictionary;
  eventId: string;
  member: EventTeamRow;
  action: (form: FormData) => void;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="eventMemberId" value={member.id} />
      <ConfirmSubmit
        className="btn-ghost btn-sm text-crit-text"
        message={t.eventTeam.removeConfirm}
      >
        <IconTrash width={14} height={14} />
        {t.eventTeam.remove}
      </ConfirmSubmit>
    </form>
  );
}

export function EventTeamManager({
  t,
  eventId,
  members,
  available,
  baseUrl,
  canManage,
}: {
  t: Dictionary;
  eventId: string;
  members: EventTeamRow[];
  available: AvailablePerson[];
  baseUrl: string;
  canManage: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [qrMember, setQrMember] = useState<EventTeamRow | null>(null);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = q
      ? members.filter(
          (m) =>
            m.name.toLowerCase().includes(q) || m.employeeCode.toLowerCase().includes(q),
        )
      : members;
    // Alphabetical, with anyone taken off the event at the end — see
    // src/lib/sort.ts.
    return [...matching].sort(byStatusThenName);
  }, [members, query]);

  const active = filtered.filter((m) => !m.isReserve);
  const reserve = filtered.filter((m) => m.isReserve);

  function link(member: EventTeamRow) {
    return `${baseUrl}/member/${member.token}`;
  }

  function renderTable(rows: EventTeamRow[]) {
    return (
      <div className="table-wrap">
        <table className="op-table op-table-stack">
          <thead>
            <tr>
              <th>{t.team.fullName}</th>
              <th>{t.team.employeeCode}</th>
              <th>{t.assignment.location}</th>
              <th>{t.eventTeam.participation}</th>
              <th>{t.eventTeam.memberLink}</th>
              {canManage ? <th className="text-end">{t.common.actions}</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((member) => (
              <tr key={member.id} className={member.status === 'CANCELLED' ? 'opacity-55' : ''}>
                <td data-label="" className="font-medium text-ink-100">
                  {member.name}
                </td>
                <td data-label={t.team.employeeCode} className="nums text-ink-400">
                  {member.employeeCode}
                </td>
                <td data-label={t.assignment.location} className="text-ink-300">
                  {member.locationName ?? (
                    <span className="text-ink-500">{t.common.unassigned}</span>
                  )}
                </td>
                <td data-label={t.eventTeam.participation}>
                  <Badge
                    tone={
                      member.status === 'CANCELLED'
                        ? 'neutral'
                        : member.status === 'ACTIVE'
                          ? 'ok'
                          : 'info'
                    }
                  >
                    {t.enums.eventMemberStatus[member.status as EventMemberStatus]}
                  </Badge>
                </td>
                <td data-label="">
                  <div className="flex items-center gap-1.5">
                    <CopyButton
                      value={link(member)}
                      label={t.eventTeam.copyLink}
                      copiedLabel={t.common.copied}
                      className="btn-secondary btn-sm flex-1 sm:flex-none"
                    />
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => setQrMember(member)}
                    >
                      <IconQr width={15} height={15} />
                      <span className="sr-only">{t.eventTeam.showQr}</span>
                    </button>
                  </div>
                </td>
                {canManage ? (
                  <td data-label="">
                    <MemberActions t={t} eventId={eventId} member={member} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

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
        {canManage ? (
          <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
            <IconPlus width={16} height={16} />
            {t.eventTeam.addToEvent}
          </button>
        ) : null}
      </div>

      <Notice tone="info">{t.eventTeam.tokenSecurityNote}</Notice>

      <div className="panel mt-4">
        <header className="panel-head">
          <h2 className="text-[15px] font-semibold text-ink-100">
            {t.eventTeam.inEvent}{' '}
            <span className="nums text-ink-500">({active.length})</span>
          </h2>
        </header>
        {active.length === 0 ? (
          <EmptyState
            title={members.length ? t.common.noResults : t.eventTeam.empty}
            hint={members.length ? undefined : t.eventTeam.emptyHint}
            icon={<IconUsers width={20} height={20} />}
            action={
              canManage && members.length === 0 ? (
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => setAdding(true)}
                >
                  {t.eventTeam.addToEvent}
                </button>
              ) : null
            }
          />
        ) : (
          renderTable(active)
        )}
      </div>

      {reserve.length > 0 ? (
        <div className="panel mt-4">
          <header className="panel-head">
            <h2 className="text-[15px] font-semibold text-ink-100">
              {t.eventTeam.reserveTeam}{' '}
              <span className="nums text-ink-500">({reserve.length})</span>
            </h2>
          </header>
          {renderTable(reserve)}
        </div>
      ) : null}

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title={t.eventTeam.addToEvent}
        description={t.eventTeam.availableMembers}
      >
        <AddMembers
          t={t}
          eventId={eventId}
          people={available}
          onDone={() => setAdding(false)}
        />
      </Dialog>

      <Dialog
        open={Boolean(qrMember)}
        onClose={() => setQrMember(null)}
        title={t.eventTeam.qrTitle}
        description={qrMember?.name}
      >
        {qrMember ? (
          <div className="space-y-4 text-center">
            {qrMember.qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrMember.qrDataUrl}
                alt={`${t.eventTeam.showQr} — ${qrMember.name}`}
                className="mx-auto h-56 w-56 rounded-lg bg-white p-2"
              />
            ) : null}
            <p className="text-[12.5px] text-ink-400">{t.eventTeam.qrHint}</p>
            <code
              dir="ltr"
              className="block break-all rounded-lg bg-ink-850 px-3 py-2 text-[12px] text-ink-300"
            >
              {link(qrMember)}
            </code>
            <div className="flex justify-center">
              <CopyButton
                value={link(qrMember)}
                label={t.eventTeam.copyLink}
                copiedLabel={t.common.copied}
                className="btn-secondary"
              />
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
