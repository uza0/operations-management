'use client';

import { useActionState, useEffect, useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  clearFromBoardAction,
  clearManyFromBoardAction,
  placeManyOnLaneAction,
  placeOnLaneAction,
  setLanesAction,
  setManyMemberRolesAction,
  setMemberRoleAction,
} from '@/server/actions/board';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { Dialog, SubmitButton } from '@/components/ui/client';
import { IconSearch } from '@/components/ui/icons';
import { EVENT_ROLES, TASKS, type Task } from '@/lib/constants';
import { format, type Dictionary } from '@/lib/i18n';
import type { BoardData, BoardPerson } from '@/server/services/board';
import { byName } from '@/lib/sort';

/**
 * The board: a pile of names on one side, the gates on the other.
 *
 * Two ways to place someone, because both are needed. Dragging is what a
 * supervisor at a desk does with a mouse. Tapping a name and then tapping a
 * lane is what the same person does on a phone at the venue, where dragging
 * across a scrolling page is hopeless.
 *
 * Every placement is written to the server immediately — there is no "save the
 * board" button, because a board that can be half-saved is a board nobody
 * trusts at five o'clock on a match day.
 *
 * A tap selects rather than replaces a selection, so the same gesture that
 * moves one person moves eight. Most of distributing a ninety-strong team is
 * the same decision repeated — these go to gate 3, these come back off — and
 * doing it one name at a time is the part of the evening that actually takes
 * the evening. Every section and the unassigned list carry a "select all" that
 * respects the search box, so filtering to "أساور" and selecting all of them
 * is one gesture rather than eleven.
 */

type Props = {
  t: Dictionary;
  data: BoardData;
  canManage: boolean;
};

function Chip({
  person,
  index,
  selected,
  onSelect,
  onRemove,
  onRole,
  draggable,
  dragIds,
  t,
}: {
  person: BoardPerson;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  onRole?: () => void;
  draggable: boolean;
  /** What this chip drags: itself, or the whole selection it belongs to. */
  dragIds: () => string[];
  t: Dictionary;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', dragIds().join(','));
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`group mb-1.5 flex items-center gap-1.5 rounded-lg border px-1.5 py-1.5 transition ${
        selected
          ? 'border-brand-500 bg-brand-500/15 ring-1 ring-brand-500/40'
          : 'border-ink-700 bg-ink-900 hover:border-ink-500'
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <span className="nums w-4 shrink-0 text-center text-[11px] text-ink-500">
        {String(index + 1).padStart(2, '0')}
      </span>
      <button
        type="button"
        onClick={onSelect}
        className="min-h-[40px] flex-1 text-start text-[13.5px] leading-tight text-ink-100 sm:min-h-[28px]"
        // Latin names inside an RTL page read correctly only when the browser
        // is told to lay each one out on its own.
        style={{ unicodeBidi: 'plaintext' }}
      >
        {person.name}
        {person.isReserve ? (
          <span className="ms-1.5 text-[11px] text-info-text">{t.eventTeam.reserve}</span>
        ) : null}
      </button>
      {onRole ? (
        <button
          type="button"
          onClick={onRole}
          aria-label={`${t.board.role} — ${person.name}`}
          title={person.eventRole ? t.enums.eventRole[person.eventRole] : t.board.roleNone}
          className={`min-h-[40px] shrink-0 rounded text-[10.5px] font-semibold leading-none sm:min-h-[28px] ${
            person.eventRole
              ? 'bg-brand-500/15 px-1.5 text-brand-300 ring-1 ring-brand-500/40'
              : 'w-5 text-ink-600 hover:text-ink-300'
          }`}
        >
          {person.eventRole ? t.enums.eventRoleShort[person.eventRole] : '⌄'}
        </button>
      ) : person.eventRole ? (
        // Read-only viewers still need to see who runs the post.
        <span className="shrink-0 rounded bg-brand-500/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-brand-300">
          {t.enums.eventRoleShort[person.eventRole]}
        </span>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${t.board.returnToPool} — ${person.name}`}
          className="min-h-[40px] min-w-[32px] rounded px-1.5 text-ink-500 hover:bg-crit/20 hover:text-crit-text sm:min-h-[28px] sm:min-w-0"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

/**
 * "Select all" for one list.
 *
 * It mirrors a checkbox rather than being one, because the thing it toggles is
 * a set of names held in React state and not a form field, and because it has
 * a third state a checkbox cannot show: some of this list is selected, the
 * rest is not. Clicking it selects everything that is currently visible —
 * which, in the pool, means everything the search box has left — and clicking
 * it again takes just those back out, leaving any other section's selection
 * alone.
 */
function SelectAll({
  t,
  ids,
  selected,
  onToggle,
}: {
  t: Dictionary;
  ids: string[];
  selected: Set<string>;
  onToggle: (ids: string[], select: boolean) => void;
}) {
  if (ids.length === 0) return null;
  const mine = ids.filter((id) => selected.has(id)).length;
  const all = mine === ids.length;
  const some = mine > 0 && !all;

  return (
    <button
      type="button"
      onClick={() => onToggle(ids, !all)}
      aria-pressed={all}
      className={`press inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors sm:min-h-[26px] ${
        mine > 0
          ? 'border-brand-600/50 bg-brand-50 text-brand-900'
          : 'border-ink-700 text-ink-500 hover:border-ink-500 hover:text-ink-300'
      }`}
    >
      <span
        aria-hidden
        className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border text-[9px] leading-none ${
          all
            ? 'border-brand-600 bg-brand-600 text-white'
            : some
              ? 'border-brand-600 bg-brand-600/20 text-brand-900'
              : 'border-ink-600'
        }`}
      >
        {all ? '✓' : some ? '–' : ''}
      </span>
      {t.board.selectAll}
    </button>
  );
}

export function DistributionBoard({ t, data, canManage }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  /*
   * A set, not a single id. Everything downstream asks the same question it
   * asked before — "is this chip selected" — so the chips, the drop targets
   * and the drag handler did not have to learn a new idea; only the answer
   * changed from an equality test to a lookup.
   */
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [roleForMany, setRoleForMany] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [roleFor, setRoleFor] = useState<BoardPerson | null>(null);
  const [lanesFor, setLanesFor] = useState<BoardData['locations'][number] | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  /*
   * The server is the truth, but a name has to move the instant it is dropped —
   * waiting for a round trip on every one of forty-eight placements makes the
   * board feel broken. The optimistic copy is replaced by the real one as soon
   * as the router refreshes.
   */
  const [board, moveOptimistic] = useOptimistic(
    data,
    (state, move: { ids: string[]; lane: string | null }) => {
      const moving = new Set(move.ids);
      const taken: BoardPerson[] = [];

      const locations = state.locations.map((location) => ({
        ...location,
        lanes: location.lanes.map((lane) => {
          const stay: BoardPerson[] = [];
          for (const person of lane.people) {
            if (moving.has(person.eventMemberId)) taken.push(person);
            else stay.push(person);
          }
          return { ...lane, people: stay };
        }),
      }));

      let pool: BoardPerson[] = [];
      for (const person of state.pool) {
        if (moving.has(person.eventMemberId)) taken.push(person);
        else pool.push(person);
      }
      if (taken.length === 0) return state;

      if (move.lane) {
        for (const location of locations) {
          const lane = location.lanes.find((l) => l.key === move.lane);
          if (lane) lane.people = [...lane.people, ...taken];
        }
      } else {
        pool = [...pool, ...taken].sort(byName);
      }

      for (const location of locations) {
        location.placed = location.lanes.reduce((sum, l) => sum + l.people.length, 0);
      }
      const placed = state.totals.team - pool.length;
      return {
        ...state,
        locations,
        pool,
        totals: { ...state.totals, placed, left: pool.length },
      };
    },
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return board.pool;
    return board.pool.filter(
      (p) => p.name.toLowerCase().includes(q) || p.employeeCode.toLowerCase().includes(q),
    );
  }, [board.pool, query]);

  const toggleOne = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleMany = (ids: string[], select: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const clearSelection = () => setSelected(new Set());

  /**
   * Move one or many.
   *
   * One name still goes through the single-person action, because that is the
   * overwhelmingly common case and it is the cheaper request; more than one
   * goes through the batch, which is the same work in one round trip instead
   * of eight. Either way the optimistic board moves everyone at once, so the
   * screen never shows a batch arriving a name at a time.
   */
  function place(ids: string[], lane: string | null) {
    if (!canManage || ids.length === 0) return;
    setError(null);
    clearSelection();

    const body = new FormData();
    body.set('eventId', board.event.id);
    if (lane) body.set('lane', lane);
    if (ids.length === 1) body.set('eventMemberId', ids[0]);
    else for (const id of ids) body.append('eventMemberIds', id);

    startTransition(async () => {
      moveOptimistic({ ids, lane });
      const single = ids.length === 1;
      const result = lane
        ? single
          ? await placeOnLaneAction(idle, body)
          : await placeManyOnLaneAction(idle, body)
        : single
          ? await clearFromBoardAction(idle, body)
          : await clearManyFromBoardAction(idle, body);
      if (result.status === 'error' || result.status === 'conflict') {
        setError(result.message);
      }
      router.refresh();
    });
  }

  /**
   * What a drag carries.
   *
   * Dragging a chip that is part of a selection drags the whole selection —
   * anything else would quietly contradict what the screen is showing. A chip
   * outside the selection drags only itself, and leaves the selection alone.
   */
  const dragPayload = (id: string) => (selected.has(id) ? [...selected] : [id]);

  const laneDropProps = (key: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!canManage) return;
      e.preventDefault();
      setDropTarget(key);
    },
    onDragLeave: () => setDropTarget((current) => (current === key ? null : current)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDropTarget(null);
      const payload = e.dataTransfer.getData('text/plain');
      const ids = payload ? payload.split(',').filter(Boolean) : [];
      if (ids.length > 0) place(ids, key === 'POOL' ? null : key);
    },
  });

  return (
    <>
      {/* The two numbers the supervisor actually watches. */}
      <div className="mb-4 grid grid-cols-3 gap-3 sm:gap-4">
        <div className="panel p-3 text-center">
          <p className="nums text-2xl font-semibold text-ink-100">{board.totals.team}</p>
          <p className="text-[12px] text-ink-500">{t.board.roster}</p>
        </div>
        <div className="panel p-3 text-center">
          <p className="nums text-2xl font-semibold text-ok-text">{board.totals.placed}</p>
          <p className="text-[12px] text-ink-500">{t.board.placed}</p>
        </div>
        <div className="panel p-3 text-center">
          <p
            className={`nums text-2xl font-semibold ${
              board.totals.left > 0 ? 'text-warn-text' : 'text-ink-500'
            }`}
          >
            {board.totals.left}
          </p>
          <p className="text-[12px] text-ink-500">{t.board.left}</p>
        </div>
      </div>

      {error ? (
        <div className="mb-3">
          <FormError message={error} />
        </div>
      ) : null}

      {note ? (
        <p className="mb-3 rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-[12.5px] text-info-text">
          {note}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr] lg:items-start">
        {/* ---- the pool ---- */}
        <aside
          className={`panel p-3 lg:sticky lg:top-4 ${
            dropTarget === 'POOL' ? 'ring-2 ring-crit/50' : ''
          }`}
          {...laneDropProps('POOL')}
        >
          <div className="mb-1 flex items-center gap-2">
            <h2 className="min-w-0 flex-1 text-[15px] font-semibold text-ink-100">
              {t.board.poolTitle}
            </h2>
            {canManage ? (
              <SelectAll
                t={t}
                ids={shown.map((p) => p.eventMemberId)}
                selected={selected}
                onToggle={toggleMany}
              />
            ) : null}
          </div>
          <p className="mb-2.5 text-[12px] leading-5 text-ink-500">{t.board.poolHint}</p>
          <div className="relative mb-2.5">
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
          <div className="max-h-[60vh] overflow-y-auto pe-0.5">
            {shown.length === 0 ? (
              <p className="px-2 py-6 text-center text-[12.5px] leading-6 text-ink-500">
                {board.pool.length === 0 ? t.board.poolEmpty : t.common.noResults}
              </p>
            ) : (
              shown.map((person, i) => (
                <Chip
                  key={person.eventMemberId}
                  person={person}
                  index={i}
                  selected={selected.has(person.eventMemberId)}
                  onSelect={() => toggleOne(person.eventMemberId)}
                  onRole={canManage ? () => setRoleFor(person) : undefined}
                  draggable={canManage}
                  dragIds={() => dragPayload(person.eventMemberId)}
                  t={t}
                />
              ))
            )}
          </div>
        </aside>

        {/* ---- the gates ---- */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {board.locations.map((location) => {
            const short = location.requiredStaff - location.placed;
            return (
              <article key={location.id} className="panel overflow-hidden p-0">
                <header className="flex items-center gap-2 border-b border-ink-800 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[14.5px] font-semibold text-ink-100">
                      {location.name}
                    </h3>
                    <p className="nums text-[11.5px] text-ink-500">
                      {location.placed} / {location.requiredStaff}
                      {short > 0 ? (
                        <span className="ms-1.5 text-warn-text">
                          {format(t.board.shortBy, { n: short })}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {canManage ? (
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => setLanesFor(location)}
                    >
                      {t.board.lanes}
                    </button>
                  ) : null}
                </header>

                <div className="grid gap-2 p-2.5">
                  {location.lanes.map((lane) => (
                    <div
                      key={lane.key}
                      {...laneDropProps(lane.key)}
                      onClick={(e) => {
                        /*
                         * The lane is the drop target, so a tap anywhere in it
                         * places the selection — but the chips inside it carry
                         * their own buttons, and a tap on one of those is not
                         * a tap on the lane.
                         */
                        if ((e.target as HTMLElement).closest('button')) return;
                        if (selected.size > 0) place([...selected], lane.key);
                      }}
                      className={`rounded-lg border border-dashed p-2 transition ${
                        dropTarget === lane.key
                          ? 'border-brand-500 bg-brand-500/10'
                          : selected.size > 0
                            ? 'cursor-pointer border-brand-500/50 bg-ink-900/40'
                            : 'border-ink-700'
                      }`}
                    >
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[11px] font-medium text-ink-300">
                          {t.enums.task[lane.task]}
                        </span>
                        {canManage && lane.people.length > 0 ? (
                          <SelectAll
                            t={t}
                            ids={lane.people.map((p) => p.eventMemberId)}
                            selected={selected}
                            onToggle={toggleMany}
                          />
                        ) : null}
                        <span className="nums ms-auto text-[11.5px] text-ink-500">
                          {lane.people.length}
                        </span>
                      </div>
                      {lane.people.length === 0 ? (
                        <p className="py-2 text-center text-[11.5px] text-ink-600">
                          {selected.size > 0 ? t.board.tapToPlace : t.board.dropHere}
                        </p>
                      ) : (
                        lane.people.map((person, i) => (
                          <Chip
                            key={person.eventMemberId}
                            person={person}
                            index={i}
                            selected={selected.has(person.eventMemberId)}
                            onSelect={() => toggleOne(person.eventMemberId)}
                            onRemove={
                              canManage ? () => place([person.eventMemberId], null) : undefined
                            }
                            onRole={canManage ? () => setRoleFor(person) : undefined}
                            draggable={canManage}
                            dragIds={() => dragPayload(person.eventMemberId)}
                            t={t}
                          />
                        ))
                      )}

                      {/*
                        A lane that is already full has no empty space left to
                        tap, and its chips are covered in buttons — so once a
                        selection exists, every lane grows an unmistakable
                        target of its own rather than asking the supervisor to
                        find a gap between two names.
                      */}
                      {canManage && selected.size > 0 ? (
                        <button
                          type="button"
                          onClick={() => place([...selected], lane.key)}
                          className="press mt-1 min-h-[40px] w-full rounded-lg border border-dashed border-brand-600/60 bg-brand-50 py-1.5 text-[11.5px] font-semibold text-brand-900 sm:min-h-[30px]"
                        >
                          {format(t.board.placeHere, { n: selected.size })}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      </div>

      {/*
        The selection bar.

        It only exists while something is selected, and it sits above the
        thumb rather than at the top of a page the supervisor has scrolled
        away from — the whole point of a selection is that you are somewhere
        else on the board by the time you act on it. It says what is selected
        and what to do next, because "8 selected" with no instruction is a
        state, not an offer.
      */}
      {canManage && selected.size > 0 ? (
        <div
          className="no-print fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:px-6"
          style={{ animation: 'rise var(--dur-enter) var(--ease-settle) backwards' }}
        >
          <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-2 rounded-card border border-ink-700 bg-ink-900 p-2.5 shadow-float">
            <span className="flex items-center gap-2 ps-1">
              <span className="nums grid h-7 min-w-[1.75rem] place-items-center rounded-full bg-brand-600 px-1.5 text-[13px] font-bold text-white">
                {selected.size}
              </span>
              <span className="hidden text-[12.5px] text-ink-400 sm:inline">
                {t.board.moveSelected}
              </span>
            </span>
            <span className="ms-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setRoleForMany(true)}
              >
                {t.board.roleSelected}
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => place([...selected], null)}
              >
                {t.board.returnSelected}
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={clearSelection}>
                {t.board.clearSelection}
              </button>
            </span>
          </div>
        </div>
      ) : null}

      {roleForMany ? (
        <RoleManyPicker
          t={t}
          eventId={board.event.id}
          ids={[...selected]}
          onDone={(message) => {
            setRoleForMany(false);
            if (message !== undefined) {
              clearSelection();
              setNote(message ?? null);
              router.refresh();
            }
          }}
        />
      ) : null}

      {roleFor ? (
        <RolePicker
          t={t}
          eventId={board.event.id}
          person={roleFor}
          onDone={(message) => {
            setRoleFor(null);
            setNote(message ?? null);
            router.refresh();
          }}
        />
      ) : null}

      {lanesFor ? (
        <LaneEditor
          t={t}
          eventId={board.event.id}
          location={lanesFor}
          onDone={(message) => {
            setLanesFor(null);
            if (message !== undefined) setNote(message ?? null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Who this person is on the day: an ordinary member, or one of the four jobs
 * that come with responsibility for other people.
 *
 * One tap, one decision — the list is short enough to be the whole dialog, and
 * every option submits the form directly, so there is no "choose, then save".
 */
function RolePicker({
  t,
  eventId,
  person,
  onDone,
}: {
  t: Dictionary;
  eventId: string;
  person: BoardPerson;
  onDone: (message?: string) => void;
}) {
  const [state, action] = useActionState(setMemberRoleAction, idle);

  useEffect(() => {
    if (state.status === 'success') onDone(state.message);
  }, [state, onDone]);

  const options: { value: string; label: string }[] = [
    { value: '', label: t.board.roleNone },
    ...EVENT_ROLES.map((role) => ({ value: role, label: t.enums.eventRole[role] })),
  ];
  const current = person.eventRole ?? '';

  return (
    <Dialog open onClose={() => onDone()} title={t.board.roleTitle} description={t.board.roleHint}>
      <form action={action} className="space-y-2">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="eventMemberId" value={person.eventMemberId} />
        <p className="text-[13.5px] text-ink-300" style={{ unicodeBidi: 'plaintext' }}>
          {person.name}
        </p>
        <div className="grid gap-1.5">
          {options.map((option) => (
            <SubmitButton
              key={option.value || 'NONE'}
              name="role"
              value={option.value}
              className={`btn-sm w-full justify-between ${
                option.value === current ? 'btn-primary' : 'btn-ghost'
              }`}
            >
              {option.label}
              {option.value === current ? <span aria-hidden>✓</span> : null}
            </SubmitButton>
          ))}
        </div>
        <FormError message={state.status === 'error' ? state.message : null} />
      </form>
    </Dialog>
  );
}

/**
 * The same four jobs, handed to everyone selected.
 *
 * It warns about the exclusive roles instead of hiding them: "make these three
 * section supervisors" is the common case and works exactly as it reads, while
 * "make these three the team leader" is a thing a person can mean to try once,
 * and finding out afterwards that only the last one kept it is worse than
 * being told first.
 */
function RoleManyPicker({
  t,
  eventId,
  ids,
  onDone,
}: {
  t: Dictionary;
  eventId: string;
  ids: string[];
  onDone: (message?: string | null) => void;
}) {
  const [state, action] = useActionState(setManyMemberRolesAction, idle);

  useEffect(() => {
    if (state.status === 'success') onDone(state.message ?? null);
  }, [state, onDone]);

  const options: { value: string; label: string }[] = [
    { value: '', label: t.board.roleNone },
    ...EVENT_ROLES.map((role) => ({ value: role, label: t.enums.eventRole[role] })),
  ];

  return (
    <Dialog
      open
      onClose={() => onDone()}
      title={format(t.board.roleManyTitle, { n: ids.length })}
      description={t.board.roleManyExclusive}
    >
      <form action={action} className="space-y-2">
        <input type="hidden" name="eventId" value={eventId} />
        {ids.map((id) => (
          <input key={id} type="hidden" name="eventMemberIds" value={id} />
        ))}
        <div className="grid gap-1.5">
          {options.map((option) => (
            <SubmitButton
              key={option.value || 'NONE'}
              name="role"
              value={option.value}
              className="btn-ghost btn-sm w-full justify-between"
            >
              {option.label}
            </SubmitButton>
          ))}
        </div>
        <FormError message={state.status === 'error' ? state.message : null} />
      </form>
    </Dialog>
  );
}

/** Which jobs this location is divided into. */
function LaneEditor({
  t,
  eventId,
  location,
  onDone,
}: {
  t: Dictionary;
  eventId: string;
  location: BoardData['locations'][number];
  onDone: (message?: string | null) => void;
}) {
  const [state, action] = useActionState(setLanesAction, idle);
  const current = new Set(location.lanes.map((l) => l.task));
  /*
   * Which jobs are ticked, as state rather than as defaultChecked, so that
   * "all" and "none" have something to set. The form still submits the plain
   * `lane` checkboxes, so the server side is unchanged.
   */
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(current));
  const allChosen = chosen.size === TASKS.length;

  useEffect(() => {
    if (state.status === 'success') onDone(state.message ?? null);
  }, [state, onDone]);

  return (
    <Dialog open onClose={() => onDone()} title={location.name} description={t.board.lanesHint}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="locationId" value={location.id} />
        <div className="flex items-center justify-between gap-3 px-0.5">
          <label className="press flex min-h-[44px] cursor-pointer items-center gap-2.5 text-[13px] font-semibold text-ink-200 sm:min-h-0">
            <input
              type="checkbox"
              className="h-4.5 w-4.5 accent-brand-500"
              checked={allChosen}
              ref={(el) => {
                if (el) el.indeterminate = chosen.size > 0 && !allChosen;
              }}
              onChange={(e) =>
                setChosen(e.target.checked ? new Set(TASKS as readonly string[]) : new Set())
              }
            />
            {t.board.selectAll}
          </label>
          <span className="nums text-[12px] text-ink-500">
            {chosen.size} / {TASKS.length}
          </span>
        </div>

        <div className="grid gap-1.5 sm:grid-cols-2">
          {TASKS.map((task) => (
            <label
              key={task}
              className="flex min-h-[44px] items-center gap-2.5 rounded-lg border border-ink-800 px-2.5 py-2 text-[13.5px] text-ink-200 sm:min-h-0"
            >
              <input
                type="checkbox"
                name="lane"
                value={task}
                checked={chosen.has(task)}
                onChange={(e) =>
                  setChosen((cur) => {
                    const next = new Set(cur);
                    if (e.target.checked) next.add(task);
                    else next.delete(task);
                    return next;
                  })
                }
                className="h-4.5 w-4.5 accent-brand-500"
              />
              {t.enums.task[task as Task]}
            </label>
          ))}
        </div>
        <FormError message={state.status === 'error' ? state.message : null} />
        <SubmitButton className="btn-primary btn-sm w-full">{t.common.save}</SubmitButton>
      </form>
    </Dialog>
  );
}
