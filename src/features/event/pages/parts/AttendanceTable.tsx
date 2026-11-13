'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  checkOutAction,
  completeUnrecordedAttendanceAction,
  recordAttendanceAction,
  recordAttendanceManyAction,
  setAttendanceTimesAction,
  setMemberCreditAction,
} from '@/server/actions/operations';
import { idle } from '@/server/actions/types';
import { EmptyState, FormError } from '@/components/ui/states';
import { Badge, attendanceTone } from '@/components/ui/status';
import { Dialog, SubmitButton, useConfirm } from '@/components/ui/client';
import { IconCheckCircle, IconSearch } from '@/components/ui/icons';
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '@/lib/constants';
import { formatTime } from '@/lib/time';
import { format, type Dictionary } from '@/lib/i18n';
import { formatAmount } from '@/lib/money';

export type AttendanceRow = {
  eventMemberId: string;
  name: string;
  employeeCode: string;
  locationName: string | null;
  isReserve: boolean;
  status: AttendanceStatus;
  /** "HH:mm", or null when nobody has written one down. */
  checkInTime: string | null;
  checkOutTime: string | null;
  recordedBy: string | null;
  notes: string | null;
  /** This person's own figure, or null to follow the event's default. */
  payAmount: number | null;
  creditNote: string | null;
  /** What they will be credited, or null when the company pays them monthly. */
  effectiveAmount: number | null;
};

const QUICK: AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'];

function StatusButtons({
  t,
  eventId,
  row,
}: {
  t: Dictionary;
  eventId: string;
  row: AttendanceRow;
}) {
  const router = useRouter();
  const [state, action] = useActionState(recordAttendanceAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <div className="flex flex-col gap-1 sm:items-end">
      {/*
        One control with four positions, not four buttons.

        They were four separate ghost buttons that wrapped onto a second line
        in the space a table cell gives them, with the row's other actions on
        a third — a hundred and forty pixels a person, two people to a
        screen, on the one table that is worked through top to bottom at a
        gate. Joined into a single segmented control they cannot wrap, the
        chosen one reads as a position rather than as a fifth thing to look
        at, and a row is one line tall.
      */}
      <div
        role="group"
        className="flex w-full overflow-hidden rounded-control border border-ink-600 sm:inline-flex sm:w-auto"
      >
        {QUICK.map((status, index) => (
          <form key={status} action={action} className="flex-1 sm:flex-none">
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="eventMemberId" value={row.eventMemberId} />
            <input type="hidden" name="status" value={status} />
            <SubmitButton
              className={`w-full whitespace-nowrap px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${
                index > 0 ? 'border-s border-ink-600' : ''
              } ${
                row.status === status
                  ? status === 'PRESENT'
                    ? 'bg-ok/20 text-ok-text'
                    : status === 'LATE'
                      ? 'bg-warn/20 text-warn-text'
                      : status === 'ABSENT'
                        ? 'bg-crit/20 text-crit-text'
                        : 'bg-info/20 text-info-text'
                  : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100'
              }`}
            >
              {t.enums.attendanceStatus[status]}
            </SubmitButton>
          </form>
        ))}
      </div>
      {state.status === 'error' ? <FormError message={state.message} /> : null}
    </div>
  );
}

function CheckOut({
  t,
  eventId,
  row,
}: {
  t: Dictionary;
  eventId: string;
  row: AttendanceRow;
}) {
  const router = useRouter();
  const [state, action] = useActionState(checkOutAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  if (row.checkOutTime || !row.checkInTime) return null;

  return (
    <form action={action}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="eventMemberId" value={row.eventMemberId} />
      <SubmitButton className="btn-ghost btn-sm">{t.attendance.checkOutAction}</SubmitButton>
    </form>
  );
}

/**
 * Correcting the record: the two clock times and what the day is worth.
 *
 * All four boxes are optional. An empty time means nobody wrote one down,
 * which is a truthful state and a common one — the alternative, a time the
 * system invented and will not let go of, is what makes a record stop matching
 * what happened. An empty credit box puts the person back on the event's
 * default rather than freezing today's number onto their row.
 */
function EditRecord({
  t,
  eventId,
  row,
  eventDefault,
  canSeeFinance,
}: {
  t: Dictionary;
  eventId: string;
  row: AttendanceRow;
  eventDefault: number;
  canSeeFinance: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [times, timesAction] = useActionState(setAttendanceTimesAction, idle);
  const [credit, creditAction] = useActionState(setMemberCreditAction, idle);

  useEffect(() => {
    if (times.status === 'success' || credit.status === 'success') router.refresh();
  }, [times, credit, router]);

  return (
    <>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {t.attendance.editRecord}
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={row.name}
        description={t.attendance.editRecordHint}
      >
        <div className="space-y-5">
          <form action={timesAction} className="space-y-3">
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="eventMemberId" value={row.eventMemberId} />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label">{t.attendance.checkIn}</span>
                <input
                  type="time"
                  name="checkInTime"
                  className="field nums"
                  defaultValue={row.checkInTime ?? ''}
                />
              </label>
              <label className="block">
                <span className="label">{t.attendance.checkOut}</span>
                <input
                  type="time"
                  name="checkOutTime"
                  className="field nums"
                  defaultValue={row.checkOutTime ?? ''}
                />
              </label>
            </div>
            <p className="text-[12px] text-ink-500">{t.attendance.timesOptional}</p>
            <FormError message={times.status === 'error' ? times.message : null} />
            <SubmitButton className="btn-primary btn-sm w-full">
              {t.attendance.saveTimes}
            </SubmitButton>
          </form>

          {canSeeFinance ? <div className="border-t border-ink-800 pt-4">
            <form action={creditAction} className="space-y-3">
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="eventMemberId" value={row.eventMemberId} />
              <label className="block">
                <span className="label">{t.credit.daysForThisPerson}</span>
                <input
                  type="number"
                  name="payAmount"
                  step="500"
                  min="0"
                  max="10000000"
                  inputMode="decimal"
                  className="field nums"
                  placeholder={String(eventDefault)}
                  defaultValue={row.payAmount ?? ''}
                />
              </label>
              <label className="block">
                <span className="label">{t.credit.note}</span>
                <input
                  type="text"
                  name="creditNote"
                  className="field"
                  maxLength={160}
                  placeholder={t.credit.notePlaceholder}
                  defaultValue={row.creditNote ?? ''}
                />
              </label>
              <p className="text-[12px] text-ink-500">
                {format(t.credit.emptyFollowsEvent, { n: eventDefault })}
              </p>
              <FormError message={credit.status === 'error' ? credit.message : null} />
              <SubmitButton className="btn-primary btn-sm w-full">
                {t.credit.saveCredit}
              </SubmitButton>
            </form>
          </div> : null}
        </div>
      </Dialog>
    </>
  );
}

export function AttendanceTable({
  t,
  locale,
  eventId,
  rows,
  canRecord,
  canManage = false,
  canSeeFinance = false,
  eventDefault = 1,
}: {
  t: Dictionary;
  locale: 'ar' | 'en';
  eventId: string;
  rows: AttendanceRow[];
  canRecord: boolean;
  /** Editing times and credit is the supervisor's, not every gate leader's. */
  canManage?: boolean;
  canSeeFinance?: boolean;
  eventDefault?: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  /*
   * Ticked rows. Kept by id rather than by index so that filtering, which
   * reorders and shortens the list under them, cannot silently move a tick
   * from one person to another.
   */
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [autoFillStatus, setAutoFillStatus] = useState<'PRESENT' | 'LATE'>('PRESENT');
  const [ask, confirmDialog] = useConfirm();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!q ||
          r.name.toLowerCase().includes(q) ||
          r.employeeCode.toLowerCase().includes(q)) &&
        (!statusFilter || r.status === statusFilter),
    );
  }, [rows, query, statusFilter]);

  const togglePicked = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Picks or drops every row the current filter is showing. */
  const selectShown = (on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      for (const row of filtered) {
        if (on) next.add(row.eventMemberId);
        else next.delete(row.eventMemberId);
      }
      return next;
    });

  const allShownPicked = filtered.length > 0 && filtered.every((r) => picked.has(r.eventMemberId));
  const somePicked = filtered.some((r) => picked.has(r.eventMemberId)) && !allShownPicked;

  async function markAll(status: AttendanceStatus) {
    if (picked.size === 0) return;
    setBulkError(null);
    setBulkPending(true);
    const body = new FormData();
    body.set('eventId', eventId);
    body.set('status', status);
    for (const id of picked) body.append('eventMemberIds', id);
    const result = await recordAttendanceManyAction(idle, body);
    setBulkPending(false);
    if (result.status !== 'success') {
      if (result.status === 'error' || result.status === 'conflict') {
        setBulkError(result.message);
      }
      return;
    }
    setPicked(new Set());
    router.refresh();
  }

  async function completeUnrecorded() {
    if (picked.size === 0 || !(await ask(t.attendance.autoFillConfirm))) return;
    setBulkError(null);
    setBulkMessage(null);
    setBulkPending(true);
    const body = new FormData();
    body.set('eventId', eventId);
    body.set('status', autoFillStatus);
    for (const id of picked) body.append('eventMemberIds', id);
    const result = await completeUnrecordedAttendanceAction(idle, body);
    setBulkPending(false);
    if (result.status !== 'success') {
      if (result.status === 'error' || result.status === 'conflict') {
        setBulkError(result.message);
      }
      return;
    }
    setBulkMessage(result.message ?? null);
    setPicked(new Set());
    router.refresh();
  }

  return (
    <>
      {confirmDialog}
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
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
        <select
          className="field w-full sm:w-[200px]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label={t.common.status}
        >
          <option value="">
            {t.common.status} — {t.common.all}
          </option>
          {ATTENDANCE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t.enums.attendanceStatus[status as AttendanceStatus]}
            </option>
          ))}
        </select>
      </div>

      {/*
        One decision, applied to everyone it covers. The bar appears only when
        rows are ticked, and it carries the same four marks as a single row so
        there is nothing new to learn — it is the row's own buttons, aimed at a
        selection instead of a person.
      */}
      {canRecord && picked.size > 0 ? (
        <div
          className="mb-3 flex flex-wrap items-center gap-2 rounded-card border border-brand-600/40 bg-brand-50 p-2.5"
          style={{ animation: 'rise var(--dur-enter) var(--ease-settle) backwards' }}
        >
          <span className="nums grid h-7 min-w-[1.75rem] place-items-center rounded-full bg-brand-600 px-1.5 text-[13px] font-bold text-white">
            {picked.size}
          </span>
          <span className="text-[12.5px] text-ink-400">{t.attendance.markSelected}</span>
          <span className="ms-auto flex flex-wrap items-center gap-1.5">
            {QUICK.map((status) => (
              <button
                key={status}
                type="button"
                disabled={bulkPending}
                onClick={() => markAll(status)}
                className="btn-secondary btn-sm"
              >
                {t.enums.attendanceStatus[status]}
              </button>
            ))}
            {canManage ? (
              <span className="flex flex-wrap items-center gap-1.5 border-s border-brand-600/30 ps-2">
                <select
                  className="field min-h-8 w-auto py-1 text-[12px]"
                  value={autoFillStatus}
                  onChange={(e) => setAutoFillStatus(e.target.value as 'PRESENT' | 'LATE')}
                  aria-label={t.attendance.autoFillStatus}
                >
                  <option value="PRESENT">{t.attendance.present}</option>
                  <option value="LATE">{t.attendance.late}</option>
                </select>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={bulkPending}
                  onClick={completeUnrecorded}
                >
                  {t.attendance.autoFillAction}
                </button>
              </span>
            ) : null}
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setPicked(new Set())}
            >
              {t.board.clearSelection}
            </button>
          </span>
          {canManage ? (
            <p className="w-full text-[12px] leading-5 text-ink-500">{t.attendance.autoFillHint}</p>
          ) : null}
        </div>
      ) : null}

      {bulkMessage ? (
        <p className="mb-3 rounded-card border border-ok/30 bg-ok/10 px-3 py-2 text-[13px] text-ok-text" role="status">
          {bulkMessage}
        </p>
      ) : null}

      {bulkError ? (
        <div className="mb-3">
          <FormError message={bulkError} />
        </div>
      ) : null}

      <div className="panel">
        {filtered.length === 0 ? (
          <EmptyState
            title={rows.length ? t.common.noResults : t.attendance.empty}
            hint={rows.length ? undefined : t.attendance.emptyHint}
            icon={<IconCheckCircle width={20} height={20} />}
          />
        ) : (
          <div className="table-wrap">
            {/*
              On a phone the table head is gone — every row becomes its own
              card — and the select-all went with it. Without this the only
              checkboxes on screen are the rows' own, each one sitting under
              the head's label, so "select all" appeared on every card and
              picked exactly one person.
            */}
            {canRecord ? (
              <label className="press mb-2.5 flex min-h-[44px] items-center gap-2.5 rounded-card border border-ink-700 bg-ink-850 px-3 text-[13px] font-semibold text-ink-200 sm:hidden">
                <input
                  type="checkbox"
                  className="h-4.5 w-4.5 accent-brand-500"
                  checked={allShownPicked}
                  ref={(el) => {
                    if (el) el.indeterminate = somePicked;
                  }}
                  onChange={(e) => selectShown(e.target.checked)}
                />
                {t.board.selectAll}
                {picked.size > 0 ? (
                  <span className="nums ms-auto text-[12px] font-normal text-ink-500">
                    {format(t.board.selectedCount, { n: picked.size })}
                  </span>
                ) : null}
              </label>
            ) : null}

            <table className="op-table op-table-stack">
              <thead>
                <tr>
                  {canRecord ? (
                    <th className="w-9">
                      <label className="flex min-h-[44px] cursor-pointer items-center sm:min-h-0">
                      <input
                        type="checkbox"
                        className="h-4.5 w-4.5 accent-brand-500"
                        aria-label={t.board.selectAll}
                        checked={allShownPicked}
                        ref={(el) => {
                          if (el) el.indeterminate = somePicked;
                        }}
                        onChange={(e) => selectShown(e.target.checked)}
                      />
                      </label>
                    </th>
                  ) : null}
                  <th>{t.assignment.member}</th>
                  <th>{t.assignment.location}</th>
                  <th>{t.common.status}</th>
                  <th>{t.attendance.checkIn}</th>
                  <th>{t.attendance.checkOut}</th>
                  {canSeeFinance ? (
                    <th>{t.credit.days} <span className="text-ink-500">({t.credit.currency})</span></th>
                  ) : null}
                  {canRecord ? <th className="text-end">{t.common.actions}</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.eventMemberId}>
                    {canRecord ? (
                      <td data-label={t.common.select}>
                        <label className="flex min-h-[44px] cursor-pointer items-center sm:min-h-0">
                          <input
                            type="checkbox"
                            className="h-4.5 w-4.5 accent-brand-500"
                            aria-label={row.name}
                            checked={picked.has(row.eventMemberId)}
                            onChange={() => togglePicked(row.eventMemberId)}
                          />
                        </label>
                      </td>
                    ) : null}
                    <td data-label="">
                      <span className="font-medium text-ink-100">{row.name}</span>
                      {row.isReserve ? (
                        <Badge tone="info" dot={false} className="ms-2">
                          {t.eventTeam.reserve}
                        </Badge>
                      ) : null}
                      <span className="nums block text-[12px] text-ink-500">
                        {row.employeeCode}
                      </span>
                    </td>
                    <td data-label={t.assignment.location} className="text-ink-300">
                      {row.locationName ?? (
                        <span className="text-ink-500">{t.common.unassigned}</span>
                      )}
                    </td>
                    <td data-label={t.common.status}>
                      <Badge tone={attendanceTone[row.status]}>
                        {t.enums.attendanceStatus[row.status]}
                      </Badge>
                      {row.notes ? (
                        <p className="mt-1 max-w-[220px] text-[12.5px] leading-4 text-ink-500">
                          {row.notes}
                        </p>
                      ) : null}
                    </td>
                    <td data-label={t.attendance.checkIn} className="nums text-ink-300">
                      {/* A dash, not a sentence: the status beside it already says so. */}
                      {row.checkInTime ? formatTime(row.checkInTime, locale) : '—'}
                    </td>
                    <td data-label={t.attendance.checkOut} className="nums text-ink-300">
                      {row.checkOutTime ? formatTime(row.checkOutTime, locale) : '—'}
                    </td>
                    {canSeeFinance ? <td data-label={t.credit.days}>
                      <span
                        className={`nums font-medium ${
                          (row.effectiveAmount ?? 0) > 0 ? 'text-ink-100' : 'text-ink-500'
                        }`}
                      >
                        {row.effectiveAmount === null
                          ? t.credit.salaried
                          : formatAmount(row.effectiveAmount)}
                      </span>
                      {/* A figure someone set by hand says so, and why. */}
                      {row.payAmount !== null ? (
                        <span className="ms-2 text-[12.5px] text-ink-500">
                          {row.creditNote || t.credit.manual}
                        </span>
                      ) : null}
                    </td> : null}
                    {canRecord ? (
                      <td data-label="">
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-nowrap sm:items-center sm:justify-end">
                          <StatusButtons t={t} eventId={eventId} row={row} />
                          <div className="flex flex-nowrap gap-1 whitespace-nowrap sm:justify-end">
                            <CheckOut t={t} eventId={eventId} row={row} />
                            {canManage ? (
                              <EditRecord
                                t={t}
                                eventId={eventId}
                                row={row}
                                eventDefault={eventDefault}
                                canSeeFinance={canSeeFinance}
                              />
                            ) : null}
                          </div>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
