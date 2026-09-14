'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { checkOutAction, recordAttendanceAction } from '@/server/actions/operations';
import { idle } from '@/server/actions/types';
import { EmptyState, FormError } from '@/components/ui/states';
import { Badge, attendanceTone } from '@/components/ui/status';
import { SubmitButton } from '@/components/ui/client';
import { IconCheckCircle, IconSearch } from '@/components/ui/icons';
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '@/lib/constants';
import { formatClock } from '@/lib/time';
import type { Dictionary } from '@/lib/i18n';

export type AttendanceRow = {
  eventMemberId: string;
  name: string;
  employeeCode: string;
  locationName: string | null;
  isReserve: boolean;
  status: AttendanceStatus;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  recordedBy: string | null;
  notes: string | null;
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

  if (row.checkOutAt || !row.checkInAt) return null;

  return (
    <form action={action}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="eventMemberId" value={row.eventMemberId} />
      <SubmitButton className="btn-ghost btn-sm">{t.attendance.checkOutAction}</SubmitButton>
    </form>
  );
}

export function AttendanceTable({
  t,
  locale,
  eventId,
  rows,
  canRecord,
}: {
  t: Dictionary;
  locale: 'ar' | 'en';
  eventId: string;
  rows: AttendanceRow[];
  canRecord: boolean;
}) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

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
                  <th>{t.assignment.member}</th>
                  <th>{t.assignment.location}</th>
                  <th>{t.common.status}</th>
                  <th>{t.attendance.checkIn}</th>
                  <th>{t.attendance.checkOut}</th>
                  {canRecord ? <th className="text-end">{t.common.actions}</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.eventMemberId}>
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
                      {row.checkInAt
                        ? formatClock(row.checkInAt, locale)
                        : t.attendance.notCheckedIn}
                    </td>
                    <td data-label={t.attendance.checkOut} className="nums text-ink-300">
                      {row.checkOutAt ? formatClock(row.checkOutAt, locale) : '—'}
                    </td>
                    {canRecord ? (
                      <td data-label="">
                        <div className="flex flex-col gap-1 sm:items-end">
                          <StatusButtons t={t} eventId={eventId} row={row} />
                          <CheckOut t={t} eventId={eventId} row={row} />
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
