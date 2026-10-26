'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  removeSeatSetupAction,
  saveSeatSetupAction,
  setSeatSetupCrewAction,
  setSeatSetupPersonAction,
} from '@/server/actions/seat-setup';
import { idle } from '@/server/actions/types';
import { FormError, EmptyState } from '@/components/ui/states';
import { ConfirmSubmit, Dialog, SubmitButton } from '@/components/ui/client';
import { IconPlus, IconUsers } from '@/components/ui/icons';
import { formatAmount } from '@/lib/money';
import { format, type Dictionary, type Locale } from '@/lib/i18n';
import { formatDate } from '@/lib/time';
import type { SeatSetupData } from '@/server/services/seat-setup';

/**
 * The chair-setting shift, end to end: the day and the rate, who is on it,
 * and whether each of them turned up.
 *
 * The rate sits on the shift and not on each person, which is the whole
 * arrangement in one field: everyone is paid the same for this regardless of
 * what they earn on the night, and there is no per-person box to disagree
 * with.
 */
export function SeatSetupManager({
  t,
  locale,
  eventId,
  data,
  defaultDate,
}: {
  t: Dictionary;
  locale: Locale;
  eventId: string;
  data: SeatSetupData;
  defaultDate: string;
}) {
  const router = useRouter();
  /** Which shift the dialogs are about: a shift object, 'new', or nothing. */
  const [editing, setEditing] = useState<SeatSetupData['shifts'][number] | 'new' | null>(null);
  const [picking, setPicking] = useState<SeatSetupData['shifts'][number] | null>(null);

  const refresh = () => {
    setEditing(null);
    setPicking(null);
    router.refresh();
  };

  const total = data.shifts.reduce(
    (sum, shift) => sum + shift.people.filter((p) => p.attended).length * shift.payAmount,
    0,
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-ink-800 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink-200">
            {format(t.seatSetup.dayCount, { n: data.shifts.length })}
          </p>
          <p className="mt-0.5 text-[12px] leading-5 text-ink-500">{t.seatSetup.daysHint}</p>
        </div>
        <p className="nums text-[13px] text-ink-300">
          {t.seatSetup.total}: <span className="font-semibold">{formatAmount(total)}</span>{' '}
          {t.credit.currency}
        </p>
        <button type="button" className="btn-primary btn-sm" onClick={() => setEditing('new')}>
          <IconPlus width={15} height={15} />
          {t.seatSetup.add}
        </button>
      </div>

      {data.shifts.length === 0 ? (
        <EmptyState
          title={t.seatSetup.none}
          hint={t.seatSetup.noneHint}
          icon={<IconUsers width={20} height={20} />}
        />
      ) : (
        data.shifts.map((shift) => (
          <ShiftBlock
            key={shift.id}
            t={t}
            locale={locale}
            eventId={eventId}
            shift={shift}
            onEdit={() => setEditing(shift)}
            onPick={() => setPicking(shift)}
            onDone={refresh}
          />
        ))
      )}

      {editing ? (
        <ShiftDialog
          t={t}
          eventId={eventId}
          detail={editing === 'new' ? null : editing}
          defaultDate={defaultDate}
          onDone={refresh}
        />
      ) : null}

      {picking ? (
        <CrewDialog
          t={t}
          locale={locale}
          eventId={eventId}
          shift={picking}
          data={data}
          onDone={refresh}
        />
      ) : null}
    </>
  );
}

/** One chair day: its hours, its rate, and who stood in the room. */
function ShiftBlock({
  t,
  locale,
  eventId,
  shift,
  onEdit,
  onPick,
  onDone,
}: {
  t: Dictionary;
  locale: Locale;
  eventId: string;
  shift: SeatSetupData['shifts'][number];
  onEdit: () => void;
  onPick: () => void;
  onDone: () => void;
}) {
  const [removeState, remove] = useActionState(removeSeatSetupAction, idle);
  const attended = shift.people.filter((p) => p.attended).length;

  useEffect(() => {
    if (removeState.status === 'success') onDone();
  }, [removeState, onDone]);

  return (
    <section className="border-b border-ink-800">
      <div className="flex flex-wrap items-center gap-3 bg-ink-900/40 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold text-ink-100">
            {formatDate(shift.date, locale)}
          </p>
          <p className="nums mt-0.5 text-[12.5px] text-ink-400">
            {shift.startTime}
            {shift.endTime ? ` → ${shift.endTime}` : ''}
            <span className="mx-1.5 text-ink-600">·</span>
            {formatAmount(shift.payAmount)} {t.credit.currency}
            <span className="mx-1.5 text-ink-600">·</span>
            {format(t.seatSetup.attendedCount, { n: attended })} / {shift.people.length}
          </p>
          {shift.notes ? (
            <p className="mt-1 text-[12.5px] leading-5 text-ink-500">{shift.notes}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={onPick}>
            {t.seatSetup.pick}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={onEdit}>
            {t.seatSetup.edit}
          </button>
          <form action={remove}>
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="detailId" value={shift.id} />
            <ConfirmSubmit
              className="btn-ghost btn-sm text-crit-text"
              message={t.seatSetup.removeConfirm}
            >
              {t.seatSetup.remove}
            </ConfirmSubmit>
          </form>
        </div>
      </div>

      {shift.people.length === 0 ? (
        <p className="px-4 py-3 text-[12.5px] text-ink-500">{t.seatSetup.empty}</p>
      ) : (
        <ul className="divide-y divide-ink-800">
          {shift.people.map((person) => (
            <PersonRow key={person.id} t={t} eventId={eventId} person={person} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** The shift itself: which day, from when, and what it pays a head. */
function ShiftDialog({
  t,
  eventId,
  detail,
  defaultDate,
  onDone,
}: {
  t: Dictionary;
  eventId: string;
  detail: SeatSetupData['shifts'][number] | null;
  defaultDate: string;
  onDone: () => void;
}) {
  const [state, action] = useActionState(saveSeatSetupAction, idle);

  useEffect(() => {
    if (state.status === 'success') onDone();
  }, [state, onDone]);

  return (
    <Dialog open onClose={onDone} title={t.seatSetup.title} description={t.seatSetup.subtitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="eventId" value={eventId} />
        {detail ? <input type="hidden" name="detailId" value={detail.id} /> : null}

        <div>
          <label className="field-label" htmlFor="ss-date">
            {t.seatSetup.date}
          </label>
          <input
            id="ss-date"
            name="date"
            type="date"
            className="field"
            defaultValue={detail?.date ?? defaultDate}
            required
          />
          <p className="mt-1 text-[12px] text-ink-500">{t.seatSetup.dateHint}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="ss-start">
              {t.seatSetup.startTime}
            </label>
            <input
              id="ss-start"
              name="startTime"
              type="time"
              className="field"
              defaultValue={detail?.startTime ?? '16:00'}
              required
            />
          </div>
          <div>
            <label className="field-label" htmlFor="ss-end">
              {t.seatSetup.endTime}
            </label>
            <input
              id="ss-end"
              name="endTime"
              type="time"
              className="field"
              defaultValue={detail?.endTime ?? ''}
            />
            <p className="mt-1 text-[12px] text-ink-500">{t.seatSetup.endTimeHint}</p>
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="ss-pay">
            {t.seatSetup.pay}
          </label>
          <input
            id="ss-pay"
            name="payAmount"
            inputMode="numeric"
            className="field nums"
            defaultValue={String(detail?.payAmount ?? 30000)}
          />
          <p className="mt-1 text-[12px] leading-5 text-ink-500">{t.seatSetup.payHint}</p>
          <p className="text-[12px] leading-5 text-ink-500">{t.seatSetup.payNote}</p>
        </div>

        <div>
          <label className="field-label" htmlFor="ss-notes">
            {t.common.notes}
          </label>
          <textarea id="ss-notes" name="notes" rows={2} className="field" defaultValue={detail?.notes ?? ''} />
        </div>

        <FormError message={state.status === 'error' ? state.message : null} />
        <SubmitButton className="btn-primary btn-sm w-full">{t.common.save}</SubmitButton>
      </form>
    </Dialog>
  );
}

/** Who is on it — by hand, or the same names as last time. */
function CrewDialog({
  t,
  locale,
  eventId,
  shift,
  data,
  onDone,
}: {
  t: Dictionary;
  locale: Locale;
  eventId: string;
  shift: SeatSetupData['shifts'][number];
  data: SeatSetupData;
  onDone: () => void;
}) {
  const [state, action] = useActionState(setSeatSetupCrewAction, idle);
  /* Picked for THIS day. The same person may be on one day and not the next. */
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(shift.people.map((p) => p.eventMemberId)),
  );

  useEffect(() => {
    if (state.status === 'success') onDone();
  }, [state, onDone]);

  const last = data.lastCrew;
  const canCopy = last.eventMemberIds.length > 0;

  return (
    <Dialog open onClose={onDone} title={t.seatSetup.pick} description={t.seatSetup.subtitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="detailId" value={shift.id} />

        {/*
          The same dozen names do most of these, so they are one tap away.
          Only people already on this event come across: somebody who set out
          chairs last month but is not on this event is not added to it.
        */}
        <div className="rounded-card border border-ink-700 bg-ink-850 p-3">
          <button
            type="button"
            className="btn-secondary btn-sm w-full"
            disabled={!canCopy}
            onClick={() => setPicked(new Set(last.eventMemberIds))}
          >
            {t.seatSetup.sameAsLast}
          </button>
          <p className="mt-1.5 text-[12px] leading-5 text-ink-500">
            {canCopy
              ? format(t.seatSetup.sameAsLastHint, {
                  event: last.eventName,
                  date: formatDate(last.eventDate, locale),
                })
              : t.seatSetup.sameAsLastNone}
          </p>
        </div>

        <div className="grid max-h-[46vh] gap-1.5 overflow-y-auto">
          {data.candidates.map((person) => (
            <label
              key={person.eventMemberId}
              className={`flex min-h-[44px] items-center gap-2.5 rounded-control border px-3 py-2 text-[13.5px] ${
                picked.has(person.eventMemberId)
                  ? 'border-brand-500 bg-brand-500/10 text-ink-100'
                  : 'border-ink-800 text-ink-200'
              }`}
            >
              <input
                type="checkbox"
                name="eventMemberId"
                value={person.eventMemberId}
                checked={picked.has(person.eventMemberId)}
                onChange={(e) =>
                  setPicked((cur) => {
                    const next = new Set(cur);
                    if (e.target.checked) next.add(person.eventMemberId);
                    else next.delete(person.eventMemberId);
                    return next;
                  })
                }
                className="h-4.5 w-4.5 accent-brand-500"
              />
              <span className="min-w-0 flex-1" style={{ unicodeBidi: 'plaintext' }}>
                {person.name}
                {person.normalPlace ? (
                  <span className="block text-[11.5px] text-ink-500">{person.normalPlace}</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>

        <FormError message={state.status === 'error' ? state.message : null} />
        <SubmitButton className="btn-primary btn-sm w-full">
          {format(t.seatSetup.crewCount, { n: picked.size })}
        </SubmitButton>
      </form>
    </Dialog>
  );
}

/** One person's day on the shift: did they come, and when. */
function PersonRow({
  t,
  eventId,
  person,
}: {
  t: Dictionary;
  eventId: string;
  person: SeatSetupData['shifts'][number]['people'][number];
}) {
  const router = useRouter();
  const [state, action] = useActionState(setSeatSetupPersonAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <li className="p-3">
      <form action={action} className="flex flex-wrap items-end gap-2.5">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="id" value={person.id} />

        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink-100" style={{ unicodeBidi: 'plaintext' }}>
            {person.name}
          </p>
          <p className="text-[12px] text-ink-500">
            <span className="nums">{person.employeeCode}</span>
            {person.normalPlace ? ` · ${person.normalPlace}` : ''}
          </p>
        </div>

        <label className="flex min-h-[44px] items-center gap-2 text-[13px] text-ink-200">
          <input
            type="checkbox"
            name="attended"
            defaultChecked={person.attended}
            className="h-4.5 w-4.5 accent-brand-500"
          />
          {t.seatSetup.attended}
        </label>

        <div>
          <label className="field-label" htmlFor={`in-${person.id}`}>
            {t.seatSetup.checkIn}
          </label>
          <input
            id={`in-${person.id}`}
            name="checkInTime"
            type="time"
            className="field w-[120px]"
            defaultValue={person.checkInTime ?? ''}
          />
        </div>
        <div>
          <label className="field-label" htmlFor={`out-${person.id}`}>
            {t.seatSetup.checkOut}
          </label>
          <input
            id={`out-${person.id}`}
            name="checkOutTime"
            type="time"
            className="field w-[120px]"
            defaultValue={person.checkOutTime ?? ''}
          />
        </div>

        <SubmitButton className="btn-ghost btn-sm">{t.common.save}</SubmitButton>
      </form>
      {state.status === 'error' ? <FormError message={state.message} /> : null}
    </li>
  );
}
