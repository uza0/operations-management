'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  removeSeatSetupAction,
  saveSeatSetupAction,
  setSeatSetupCrewAction,
  setSeatSetupPersonAction,
  markSeatSetupAttendanceAction,
} from '@/server/actions/seat-setup';
import { approveSeatArrivalsAction } from '@/server/actions/journey';
import { idle } from '@/server/actions/types';
import { FormError, EmptyState } from '@/components/ui/states';
import { ConfirmSubmit, Dialog, SubmitButton } from '@/components/ui/client';
import { IconPlus, IconUsers } from '@/components/ui/icons';
import { Badge } from '@/components/ui/status';
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
  const assigned = data.shifts.reduce((sum, shift) => sum + shift.people.length, 0);
  const attended = data.shifts.reduce(
    (sum, shift) => sum + shift.people.filter((person) => person.attended).length,
    0,
  );

  return (
    <>
      <div className="border-b border-ink-800 p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-2xl text-[14px] leading-6 text-ink-300">{t.seatSetup.daysHint}</p>
          <button
            type="button"
            className="btn-primary btn-sm w-full justify-center sm:w-auto"
            onClick={() => setEditing('new')}
          >
            <IconPlus width={15} height={15} />
            {t.seatSetup.add}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryStat label={t.seatSetup.daysLabel} value={data.shifts.length} />
          <SummaryStat label={t.seatSetup.assignedCrew} value={assigned} />
          <SummaryStat label={t.seatSetup.attendanceSummary} value={`${attended} / ${assigned}`} />
          <SummaryStat
            label={t.seatSetup.total}
            value={`${formatAmount(total)} ${t.credit.currency}`}
            prominent
          />
        </div>
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

function SummaryStat({
  label,
  value,
  prominent = false,
}: {
  label: string;
  value: string | number;
  prominent?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-card border border-ink-700 bg-ink-900/70 px-3 py-2.5">
      <p className="text-[12px] font-medium text-ink-300">{label}</p>
      <p className={`nums mt-1 truncate text-[16px] font-bold ${prominent ? 'text-brand-300' : 'text-ink-50'}`}>
        {value}
      </p>
    </div>
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
  const router = useRouter();
  const [removeState, remove] = useActionState(removeSeatSetupAction, idle);
  const [attendanceState, markAttendance] = useActionState(markSeatSetupAttendanceAction, idle);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const attended = shift.people.filter((p) => p.attended).length;
  const confirmed = shift.people.filter((person) => person.confirmedAt).length;
  const waiting = shift.people.filter((person) => person.notifiedAt && !person.confirmedAt && !person.declinedAt).length;
  const notInvited = shift.people.filter((person) => !person.notifiedAt).length;
  const declined = shift.people.filter((person) => person.declinedAt).length;
  const selectedIds = shift.people.filter((person) => selected.has(person.id)).map((person) => person.id);
  const selectedCount = selectedIds.length;
  const allSelected = shift.people.length > 0 && selectedCount === shift.people.length;

  useEffect(() => {
    if (removeState.status === 'success') onDone();
  }, [removeState, onDone]);

  useEffect(() => {
    if (attendanceState.status === 'success') {
      setSelected(new Set());
      router.refresh();
    }
  }, [attendanceState, router]);

  return (
    <section className="border-b border-ink-800 p-3 sm:p-4">
      {/*
        Stacked on a phone, side by side on a desk.

        One flex-wrap row did both, and on a 390px screen the three buttons
        took the width while the date was squeezed into a column one word
        wide — the day of the shift, which is the only thing on this header
        anybody reads first.
      */}
      <div className="rounded-card border border-ink-700 bg-ink-900/70 p-3 sm:p-4">
       <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-bold text-ink-50">
            {formatDate(shift.date, locale)}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-300">
            <span className="nums">
              {shift.startTime}
              {shift.endTime ? ` → ${shift.endTime}` : ''}
            </span>
            <span aria-hidden className="text-ink-600">·</span>
            <span className="nums">
              {formatAmount(shift.payAmount)} {t.credit.currency}
            </span>
            <span aria-hidden className="text-ink-600">·</span>
            <span className="nums">
              {format(t.seatSetup.attendedCount, { n: attended })} / {shift.people.length}
            </span>
          </p>
          {shift.notes ? (
          <p className="mt-1 text-[13px] leading-5 text-ink-300">{shift.notes}</p>
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

      <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t.seatSetup.shiftStatus}>
        <Badge tone="ok">{t.seatSetup.confirmedList}: {confirmed}</Badge>
        {waiting > 0 ? <Badge tone="warn">{t.seatSetup.waitingReply}: {waiting}</Badge> : null}
        {notInvited > 0 ? <Badge tone="neutral">{t.seatSetup.notAsked}: {notInvited}</Badge> : null}
        {declined > 0 ? <Badge tone="crit">{t.seatSetup.declinedList}: {declined}</Badge> : null}
        <Badge tone="neutral">{t.seatSetup.attendedCount.replace('{n}', String(attended))} / {shift.people.length}</Badge>
      </div>
      </div>

      {shift.people.length === 0 ? (
        <p className="px-4 py-3 text-[12.5px] text-ink-500">{t.seatSetup.empty}</p>
      ) : (
        <>
          <form action={markAttendance} className="mt-2 flex flex-wrap items-center gap-3 rounded-card border border-ink-800 bg-ink-900/50 px-3 py-2.5">
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="detailId" value={shift.id} />
            {selectedIds.map((id) => <input key={id} type="hidden" name="seatMemberIds" value={id} />)}
            <label className="flex min-h-10 items-center gap-2 text-[13px] font-medium text-ink-200">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(event) => setSelected(event.target.checked ? new Set(shift.people.map((person) => person.id)) : new Set())}
                className="h-4.5 w-4.5 accent-brand-500"
              />
              {t.seatSetup.selectAll}
            </label>
            <span className="text-[13px] text-ink-300">{format(t.seatSetup.selectedCount, { n: selectedCount })}</span>
            <SubmitButton
              className="btn-primary btn-sm"
              disabled={selectedCount === 0}
            >
              {format(t.seatSetup.markPresentSelected, { n: selectedCount })}
            </SubmitButton>
            {attendanceState.status === 'error' ? <FormError message={attendanceState.message} /> : null}
          </form>
          <ul className="mt-2 space-y-2">
            {shift.people.map((person) => (
              <PersonRow
                key={person.id}
                t={t}
                eventId={eventId}
                person={person}
                selected={selected.has(person.id)}
                onSelect={(checked) => setSelected((current) => {
                  const next = new Set(current);
                  if (checked) next.add(person.id);
                  else next.delete(person.id);
                  return next;
                })}
              />
            ))}
          </ul>
        </>
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
  selected,
  onSelect,
}: {
  t: Dictionary;
  eventId: string;
  person: SeatSetupData['shifts'][number]['people'][number];
  selected: boolean;
  onSelect: (checked: boolean) => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState(setSeatSetupPersonAction, idle);
  const [approveState, approve] = useActionState(approveSeatArrivalsAction, idle);

  useEffect(() => {
    if (state.status === 'success' || approveState.status === 'success') router.refresh();
  }, [state, approveState, router]);

  /*
   * Where this person is in the day, in one line above the controls.
   *
   * The manual checkbox below stays: somebody whose phone died is marked
   * present by hand, as he always was. What this adds is the ordinary path —
   * he says he is at the hall, and a tap here is what counts the day for him.
   */
  const waiting = Boolean(person.reportedArrivalAt) && !person.approvedAt;

  const invitationLabel = person.declinedAt
    ? t.seatSetup.declinedList
    : person.confirmedAt
      ? t.seatSetup.confirmedList
      : person.notifiedAt
        ? t.seatSetup.waitingReply
        : t.seatSetup.notAsked;

  return (
    <li className={`rounded-card border p-3 sm:px-4 ${selected ? 'border-brand-500/70 bg-brand-500/5' : 'border-ink-800 bg-ink-900/40'}`}>
      <div className="flex flex-wrap items-start gap-3">
        <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelect(event.target.checked)}
            aria-label={format(t.seatSetup.selectMember, { name: person.name })}
            className="mt-1 h-4.5 w-4.5 shrink-0 accent-brand-500"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-ink-50" style={{ unicodeBidi: 'plaintext' }}>{person.name}</span>
            <span className="mt-0.5 block text-[13px] text-ink-300">
              <span className="nums">{person.employeeCode}</span>
              {person.normalPlace ? ` · ${person.normalPlace}` : ''}
            </span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={person.declinedAt ? 'crit' : person.confirmedAt ? 'ok' : person.notifiedAt ? 'warn' : 'neutral'}>
            {invitationLabel}
          </Badge>
          <Badge tone={person.attended ? 'ok' : 'neutral'}>
            {person.attended ? t.seatSetup.attended : t.seatSetup.notAttended}
          </Badge>
          {waiting ? <Badge tone="warn">{t.seatSetup.approveTitle}</Badge> : null}
          {person.approvedAt ? <Badge tone="ok">{t.journey.approved}</Badge> : null}
        </div>
        {waiting ? (
          <form action={approve} className="w-full sm:w-auto">
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="seatMemberId" value={person.id} />
            <SubmitButton className="btn-primary btn-sm w-full sm:w-auto">{t.journey.approve}</SubmitButton>
          </form>
        ) : null}
      </div>

      <details className="mt-2 border-t border-ink-800 pt-2">
        <summary className="min-h-10 cursor-pointer py-2 text-[13px] font-medium text-ink-300 hover:text-ink-100">
          {t.seatSetup.editAttendance}
        </summary>
      <form action={action} className="space-y-3 pb-1">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="id" value={person.id} />
        <label className="flex min-h-11 items-center gap-2.5 text-[14px] font-medium text-ink-200">
          <input
            type="checkbox"
            name="attended"
            defaultChecked={person.attended}
            className="h-4.5 w-4.5 accent-brand-500"
          />
          {t.seatSetup.attended}
        </label>
        <div className="grid grid-cols-2 gap-2.5 sm:max-w-md">
          <div className="min-w-0">
            <label className="field-label" htmlFor={`in-${person.id}`}>
              {t.seatSetup.checkIn}
            </label>
            <input
              id={`in-${person.id}`}
              name="checkInTime"
              type="time"
              className="field w-full"
              defaultValue={person.checkInTime ?? ''}
            />
          </div>
          <div className="min-w-0">
            <label className="field-label" htmlFor={`out-${person.id}`}>
              {t.seatSetup.checkOut}
            </label>
            <input
              id={`out-${person.id}`}
              name="checkOutTime"
              type="time"
              className="field w-full"
              defaultValue={person.checkOutTime ?? ''}
            />
          </div>
        </div>

        <SubmitButton className="btn-secondary btn-sm w-full justify-center sm:w-auto">
          {t.common.save}
        </SubmitButton>
      </form>
      </details>
      {state.status === 'error' ? <FormError message={state.message} /> : null}
    </li>
  );
}
