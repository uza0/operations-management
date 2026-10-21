'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  removeMainGateAction,
  removeMainGateMemberAction,
  saveMainGateAction,
  setMainGateMemberAction,
} from '@/server/actions/main-gate';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { ConfirmSubmit, Dialog, SubmitButton } from '@/components/ui/client';
import { IconSearch } from '@/components/ui/icons';
import { TASKS, type Task } from '@/lib/constants';
import { formatTime } from '@/lib/time';
import { format, type Dictionary } from '@/lib/i18n';
import type { MainGateData } from '@/server/services/main-gate';

/**
 * The main-gate detail, as a panel under the board.
 *
 * It looks deliberately unlike the board: the board is where the event's
 * staffing is decided, and this is a short list of people borrowed for a few
 * hours beforehand. Making it a second drag-and-drop surface would suggest the
 * two are the same kind of thing, and the one mistake worth preventing here is
 * someone believing a name moved to the main gate has left its own gate.
 */
export function MainGatePanel({
  t,
  locale,
  eventId,
  data,
  suggested,
  canManage,
}: {
  t: Dictionary;
  locale: 'ar' | 'en';
  eventId: string;
  data: MainGateData;
  suggested: { start: string; end: string };
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);

  const total = data.people.length;

  return (
    <section className="panel mt-4 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-ink-100">{t.mainGate.title}</h2>
          <p className="mt-1 text-[12.5px] leading-5 text-ink-500">
            {data.detail ? t.mainGate.explain : t.mainGate.subtitle}
          </p>
        </div>

        {canManage ? (
          data.detail ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(true)}>
                {t.mainGate.edit}
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={() => setPicking(true)}>
                {t.mainGate.addPeople}
              </button>
            </div>
          ) : (
            <button type="button" className="btn-primary btn-sm" onClick={() => setEditing(true)}>
              {t.mainGate.create}
            </button>
          )
        ) : null}
      </div>

      {data.detail ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-ink-800 bg-ink-900/60 px-3 py-2.5">
            <span className="text-[14px] font-semibold text-ink-100">{data.detail.name}</span>
            <span className="nums text-[13px] text-brand-300">
              {formatTime(data.detail.startTime, locale)} –{' '}
              {formatTime(data.detail.endTime, locale)}
            </span>
            <span className="nums text-[12.5px] text-ink-500">
              {format(t.mainGate.countLabel, { n: total })}
            </span>
            {data.detail.notes ? (
              <span className="w-full text-[12.5px] text-ink-400">{data.detail.notes}</span>
            ) : null}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {data.groups.map((group) => (
              <div key={group.task} className="rounded-lg border border-ink-800 p-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[11px] font-medium text-ink-300">
                    {t.enums.task[group.task]}
                  </span>
                  <span className="nums ms-auto text-[11.5px] text-ink-500">
                    {group.people.length}
                  </span>
                </div>
                {group.people.length === 0 ? (
                  <p className="py-2 text-center text-[11.5px] text-ink-600">{t.mainGate.nobody}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {group.people.map((person) => (
                      <li
                        key={person.id}
                        className="flex items-center gap-2 rounded-lg border border-ink-800 bg-ink-900 px-2 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate text-[13.5px] text-ink-100"
                            style={{ unicodeBidi: 'plaintext' }}
                          >
                            {person.name}
                          </p>
                          {/* Where they go when the detail ends — the thing a
                              supervisor is checking when he reads this list. */}
                          <p className="truncate text-[11.5px] text-ink-500">
                            {person.normalPlace
                              ? format(t.mainGate.thenBackTo, { place: person.normalPlace })
                              : t.mainGate.noPlace}
                          </p>
                        </div>
                        {canManage ? <RemoveOne t={t} eventId={eventId} rowId={person.id} /> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {editing ? (
        <DetailForm
          t={t}
          eventId={eventId}
          detail={data.detail}
          suggested={suggested}
          onDone={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      ) : null}

      {picking ? (
        <PeoplePicker
          t={t}
          eventId={eventId}
          data={data}
          onDone={() => {
            setPicking(false);
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function RemoveOne({
  t,
  eventId,
  rowId,
}: {
  t: Dictionary;
  eventId: string;
  rowId: string;
}) {
  const router = useRouter();
  const [state, action] = useActionState(removeMainGateMemberAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={action}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="rowId" value={rowId} />
      <SubmitButton className="min-h-[40px] min-w-[32px] rounded px-1.5 py-1 text-ink-500 hover:bg-crit/20 hover:text-crit-text sm:min-h-0 sm:min-w-0">
        <span className="sr-only">{t.mainGate.removeMember}</span>
        <span aria-hidden>×</span>
      </SubmitButton>
    </form>
  );
}

/** The place and the hours. */
function DetailForm({
  t,
  eventId,
  detail,
  suggested,
  onDone,
}: {
  t: Dictionary;
  eventId: string;
  detail: MainGateData['detail'];
  suggested: { start: string; end: string };
  onDone: () => void;
}) {
  const [state, action] = useActionState(saveMainGateAction, idle);
  const [removeState, removeAction] = useActionState(removeMainGateAction, idle);

  useEffect(() => {
    if (state.status === 'success' || removeState.status === 'success') onDone();
  }, [state, removeState, onDone]);

  return (
    <Dialog open onClose={onDone} title={t.mainGate.title} description={t.mainGate.explain}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="eventId" value={eventId} />

        <div>
          <label className="field-label" htmlFor="mg-name">
            {t.mainGate.locationName}
          </label>
          <input
            id="mg-name"
            name="name"
            className="field"
            required
            defaultValue={detail?.name ?? t.mainGate.locationPlaceholder}
            placeholder={t.mainGate.locationPlaceholder}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="mg-start">
              {t.mainGate.from}
            </label>
            <input
              id="mg-start"
              name="startTime"
              type="time"
              className="field nums"
              required
              dir="ltr"
              defaultValue={detail?.startTime ?? suggested.start}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="mg-end">
              {t.mainGate.to}
            </label>
            <input
              id="mg-end"
              name="endTime"
              type="time"
              className="field nums"
              required
              dir="ltr"
              defaultValue={detail?.endTime ?? suggested.end}
            />
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="mg-notes">
            {t.mainGate.notes}
          </label>
          <input id="mg-notes" name="notes" className="field" defaultValue={detail?.notes ?? ''} />
        </div>

        <FormError message={state.status === 'error' ? state.message : null} />
        <SubmitButton className="btn-primary btn-sm w-full">{t.common.save}</SubmitButton>
      </form>

      {detail ? (
        <form action={removeAction} className="mt-3 border-t border-ink-800 pt-3">
          <input type="hidden" name="eventId" value={eventId} />
          <ConfirmSubmit
            message={t.mainGate.remove}
            className="btn-ghost btn-sm w-full text-crit-text"
          >
            {t.mainGate.remove}
          </ConfirmSubmit>
        </form>
      ) : null}
    </Dialog>
  );
}

/**
 * Picking people. The list is the whole event team, including everybody
 * already posted at a gate — being posted is the normal case here, not a
 * reason to be excluded.
 */
function PeoplePicker({
  t,
  eventId,
  data,
  onDone,
}: {
  t: Dictionary;
  eventId: string;
  data: MainGateData;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState(setMainGateMemberAction, idle);
  const [query, setQuery] = useState('');
  const [task, setTask] = useState<Task>('ELECTRONIC_SCANNING');

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data.candidates;
    if (!q) return list;
    return list.filter(
      (c) => c.name.toLowerCase().includes(q) || c.employeeCode.toLowerCase().includes(q),
    );
  }, [data.candidates, query]);

  return (
    <Dialog open onClose={onDone} title={t.mainGate.addPeople} description={t.mainGate.explain}>
      <div className="space-y-3">
        <div>
          <label className="field-label" htmlFor="mg-task">
            {t.mainGate.pickTask}
          </label>
          <select
            id="mg-task"
            className="field"
            value={task}
            onChange={(e) => setTask(e.target.value as Task)}
          >
            {TASKS.map((value) => (
              <option key={value} value={value}>
                {t.enums.task[value as Task]}
              </option>
            ))}
          </select>
        </div>

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

        <FormError message={state.status === 'error' ? state.message : null} />

        <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
          {shown.map((person) => (
            <form
              key={person.eventMemberId}
              action={action}
              className="flex items-center gap-2 rounded-lg border border-ink-800 bg-ink-900 px-2 py-1.5"
            >
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="eventMemberId" value={person.eventMemberId} />
              <input type="hidden" name="task" value={task} />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[13.5px] text-ink-100"
                  style={{ unicodeBidi: 'plaintext' }}
                >
                  {person.name}
                </p>
                <p className="truncate text-[11.5px] text-ink-500">
                  {person.normalPlace ?? t.mainGate.noPlace}
                </p>
              </div>
              <SubmitButton className={person.picked ? 'btn-ghost btn-sm' : 'btn-secondary btn-sm'}>
                {person.picked ? t.mainGate.pickTask : t.common.add}
              </SubmitButton>
            </form>
          ))}
          {shown.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12.5px] text-ink-500">{t.common.noResults}</p>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
