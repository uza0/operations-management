'use client';

import { useActionState, useEffect, useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  clearFromBoardAction,
  placeOnLaneAction,
  setLanesAction,
} from '@/server/actions/board';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { Dialog, SubmitButton } from '@/components/ui/client';
import { IconSearch } from '@/components/ui/icons';
import { TASKS, type Task } from '@/lib/constants';
import { format, type Dictionary } from '@/lib/i18n';
import type { BoardData, BoardPerson } from '@/server/services/board';

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
  draggable,
  t,
}: {
  person: BoardPerson;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  draggable: boolean;
  t: Dictionary;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', person.eventMemberId);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`group mb-1.5 flex items-center gap-2 rounded-lg border px-2 py-1.5 transition ${
        selected
          ? 'border-brand-500 bg-brand-500/15 ring-1 ring-brand-500/40'
          : 'border-ink-700 bg-ink-900 hover:border-ink-500'
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <span className="nums w-6 shrink-0 text-center text-[11px] text-ink-500">
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

export function DistributionBoard({ t, data, canManage }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
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
    (state, move: { eventMemberId: string; lane: string | null }) => {
      let person: BoardPerson | undefined;
      const locations = state.locations.map((location) => ({
        ...location,
        lanes: location.lanes.map((lane) => {
          const found = lane.people.find((p) => p.eventMemberId === move.eventMemberId);
          if (found) person = found;
          return { ...lane, people: lane.people.filter((p) => p !== found) };
        }),
      }));
      let pool = state.pool.filter((p) => {
        if (p.eventMemberId !== move.eventMemberId) return true;
        person = p;
        return false;
      });
      if (!person) return state;

      if (move.lane) {
        for (const location of locations) {
          const lane = location.lanes.find((l) => l.key === move.lane);
          if (lane) lane.people = [...lane.people, person];
        }
      } else {
        pool = [...pool, person].sort((a, b) => a.name.localeCompare(b.name));
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

  function place(eventMemberId: string, lane: string | null) {
    if (!canManage) return;
    setError(null);
    setSelected(null);
    const body = new FormData();
    body.set('eventId', board.event.id);
    body.set('eventMemberId', eventMemberId);
    if (lane) body.set('lane', lane);

    startTransition(async () => {
      moveOptimistic({ eventMemberId, lane });
      const result = lane
        ? await placeOnLaneAction(idle, body)
        : await clearFromBoardAction(idle, body);
      if (result.status === 'error' || result.status === 'conflict') {
        setError(result.message);
      }
      router.refresh();
    });
  }

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
      const id = e.dataTransfer.getData('text/plain');
      if (id) place(id, key === 'POOL' ? null : key);
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

      <div className="grid gap-4 lg:grid-cols-[300px_1fr] lg:items-start">
        {/* ---- the pool ---- */}
        <aside
          className={`panel p-3 lg:sticky lg:top-4 ${
            dropTarget === 'POOL' ? 'ring-2 ring-crit/50' : ''
          }`}
          {...laneDropProps('POOL')}
        >
          <h2 className="mb-1 text-[15px] font-semibold text-ink-100">{t.board.poolTitle}</h2>
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
                  selected={selected === person.eventMemberId}
                  onSelect={() =>
                    setSelected((current) =>
                      current === person.eventMemberId ? null : person.eventMemberId,
                    )
                  }
                  draggable={canManage}
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
                      onClick={() => selected && place(selected, lane.key)}
                      className={`rounded-lg border border-dashed p-2 transition ${
                        dropTarget === lane.key
                          ? 'border-brand-500 bg-brand-500/10'
                          : selected
                            ? 'border-brand-500/50 bg-ink-900/40'
                            : 'border-ink-700'
                      }`}
                    >
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[11px] font-medium text-ink-300">
                          {t.enums.task[lane.task]}
                        </span>
                        <span className="nums ms-auto text-[11.5px] text-ink-500">
                          {lane.people.length}
                        </span>
                      </div>
                      {lane.people.length === 0 ? (
                        <p className="py-2 text-center text-[11.5px] text-ink-600">
                          {selected ? t.board.tapToPlace : t.board.dropHere}
                        </p>
                      ) : (
                        lane.people.map((person, i) => (
                          <Chip
                            key={person.eventMemberId}
                            person={person}
                            index={i}
                            selected={selected === person.eventMemberId}
                            onSelect={() =>
                              setSelected((current) =>
                                current === person.eventMemberId ? null : person.eventMemberId,
                              )
                            }
                            onRemove={canManage ? () => place(person.eventMemberId, null) : undefined}
                            draggable={canManage}
                            t={t}
                          />
                        ))
                      )}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      </div>

      {lanesFor ? (
        <LaneEditor
          t={t}
          eventId={board.event.id}
          location={lanesFor}
          onDone={() => {
            setLanesFor(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
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
  onDone: () => void;
}) {
  const [state, action] = useActionState(setLanesAction, idle);
  const current = new Set(location.lanes.map((l) => l.task));

  useEffect(() => {
    if (state.status === 'success') onDone();
  }, [state, onDone]);

  return (
    <Dialog open onClose={onDone} title={location.name} description={t.board.lanesHint}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="locationId" value={location.id} />
        <div className="grid gap-1.5 sm:grid-cols-2">
          {TASKS.map((task) => (
            <label
              key={task}
              className="flex items-center gap-2.5 rounded-lg border border-ink-800 px-2.5 py-2 text-[13.5px] text-ink-200"
            >
              <input
                type="checkbox"
                name="lane"
                value={task}
                defaultChecked={current.has(task as Task)}
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
