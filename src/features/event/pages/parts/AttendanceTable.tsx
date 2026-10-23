'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  checkOutAction,
  recordAttendanceAction,
  recordAttendanceManyAction,
  setAttendanceTimesAction,
  setMemberCreditAction,
} from '@/server/actions/operations';
import { idle } from '@/server/actions/types';
import { EmptyState, FormError } from '@/components/ui/states';
import { Badge, attendanceTone } from '@/components/ui/status';
import { Dialog, SubmitButton } from '@/components/ui/client';
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
  /** What they will actually be credited, once the rule is applied. */
  effectiveAmount: number;
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
      {/* Two columns of full-width buttons on a phone, one row on desktop. */}
      <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:justify-end sm:gap-1">
        {QUICK.map((status) => (
          <form key={status} action={action} className="contents sm:block">
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="eventMemberId" value={row.eventMemberId} />
            <input type="hidden" name="status" value={status} />
            <SubmitButton
              className={`btn-sm w-full sm:w-auto ${
                row.status === status
                  ? status === 'PRESENT'
                    ? 'bg-ok/20 text-ok-text border border-ok/50'
                    : status === 'LATE'
                      ? 'bg-warn/20 text-warn-text border border-warn/50'
                      : status === 'ABSENT'
                        ? 'bg-crit/20 text-crit-text border border-crit/50'
                        : 'bg-info/20 text-info-text border border-info/50'
                  : 'btn-ghost'
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
}: {
  t: Dictionary;
  eventId: string;
  row: AttendanceRow;
  eventDefault: number;
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

          <div className="border-t border-ink-800 pt-4">
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
          </div>
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
  eventDefault = 1,
}: {
  t: Dictionary;
  locale: 'ar' | 'en';
  eventId: string;
  rows: AttendanceRow[];
  canRecord: boolean;
  /** Editing times and credit is the supervisor's, not every gate leader's. */
  canManage?: boolean;
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
    if (result.status === 'error' || result.status === 'conflict') {
      setBulkError(result.message);
      return;
    }
    setPicked(new Set());
    router.refresh();
  }

  return (
    <>
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
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setPicked(new Set())}
            >
              {t.board.clearSelection}
            </button>
          </span>
        </div>
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
                        onChange={(e) =>
                          setPicked((current) => {
                            const next = new Set(current);
                            for (const row of filtered) {
                              if (e.target.checked) next.add(row.eventMemberId);
                              else next.delete(row.eventMemberId);
                            }
                            return next;
                          })
                        }
                      />
                      </label>
                    </th>
                  ) : null}
                  <th>{t.assignment.member}</th>
                  <th>{t.assignment.location}</th>
                  <th>{t.common.status}</th>
                  <th>{t.attendance.checkIn}</th>
                  <th>{t.attendance.checkOut}</th>
                  <th>
                    {t.credit.days} <span className="text-ink-500">({t.credit.currency})</span>
                  </th>
                  {canRecord ? <th className="text-end">{t.common.actions}</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.eventMemberId}>
                    {canRecord ? (
                      <td data-label={t.board.selectAll}>
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
                        <p className="mt-1 max-w-[220px] text-[11.5px] leading-4 text-ink-500">
                          {row.notes}
                        </p>
                      ) : null}
                    </td>
                    <td data-label={t.attendance.checkIn} className="nums text-ink-300">
                      {row.checkInTime
                        ? formatTime(row.checkInTime, locale)
                        : t.attendance.notCheckedIn}
                    </td>
                    <td data-label={t.attendance.checkOut} className="nums text-ink-300">
                      {row.checkOutTime ? formatTime(row.checkOutTime, locale) : '—'}
                    </td>
                    <td data-label={t.credit.days}>
                      <span
                        className={`nums font-medium ${
                          row.effectiveAmount > 0 ? 'text-ink-100' : 'text-ink-500'
                        }`}
                      >
                        {formatAmount(row.effectiveAmount)}
                      </span>
                      {/* A figure someone set by hand says so, and why. */}
                      {row.payAmount !== null ? (
                        <span className="ms-2 text-[11.5px] text-ink-500">
                          {row.creditNote || t.credit.manual}
                        </span>
                      ) : null}
                    </td>
                    {canRecord ? (
                      <td data-label="">
                        <div className="flex flex-col gap-1 sm:items-end">
                          <StatusButtons t={t} eventId={eventId} row={row} />
                          <div className="flex flex-wrap gap-1 sm:justify-end">
                            <CheckOut t={t} eventId={eventId} row={row} />
                            {canManage ? (
                              <EditRecord
                                t={t}
                                eventId={eventId}
                                row={row}
                                eventDefault={eventDefault}
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
