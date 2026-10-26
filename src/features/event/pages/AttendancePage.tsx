import { and, eq, ne } from 'drizzle-orm';

import { db } from '@/db';
import {
  assignments,
  attendance,
  eventMembers,
  gates,
  teamMembers,
  users,
  workingPoints,
} from '@/db/schema';
import { loadEventPage } from '@/features/event/workspace';
import { PageHeader, StatTile } from '@/components/ui/panel';
import type { AttendanceStatus } from '@/lib/constants';
import { creditFor } from '@/server/services/credit';

import { AttendanceTable, type AttendanceRow } from './parts/AttendanceTable';
import { EventCreditDefault } from './parts/EventCreditDefault';
import { byName } from '@/lib/sort';

export async function EventAttendancePage({ eventId }: { eventId: string }) {
  const { scope, event, locale, t } = await loadEventPage(eventId);

  const rows = await db
    .select({
      eventMemberId: eventMembers.id,
      name: teamMembers.fullName,
      employeeCode: teamMembers.employeeCode,
      isReserve: eventMembers.isReserve,
      memberStatus: eventMembers.status,
      status: attendance.status,
      checkInTime: attendance.checkInTime,
      checkOutTime: attendance.checkOutTime,
      payAmount: eventMembers.payAmount,
      payMode: eventMembers.payMode,
      creditNote: eventMembers.creditNote,
      notes: attendance.notes,
      recordedBy: users.name,
      gateId: assignments.gateId,
      gateName: gates.name,
      workingPointName: workingPoints.name,
    })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .leftJoin(attendance, eq(attendance.eventMemberId, eventMembers.id))
    .leftJoin(users, eq(attendance.recordedById, users.id))
    .leftJoin(
      assignments,
      and(
        eq(assignments.eventMemberId, eventMembers.id),
        ne(assignments.status, 'CANCELLED'),
      ),
    )
    .leftJoin(gates, eq(assignments.gateId, gates.id))
    .leftJoin(workingPoints, eq(assignments.workingPointId, workingPoints.id))
    .where(eq(eventMembers.eventId, eventId));

  const scoped = scope.gateId ? rows.filter((r) => r.gateId === scope.gateId) : rows;

  const data: AttendanceRow[] = scoped
    .filter((r) => r.memberStatus !== 'CANCELLED')
    .map((r) => ({
      eventMemberId: r.eventMemberId,
      name: r.name,
      employeeCode: r.employeeCode,
      locationName: r.gateName ?? r.workingPointName ?? null,
      isReserve: r.isReserve,
      status: (r.status ?? 'PENDING') as AttendanceStatus,
      checkInTime: r.checkInTime,
      checkOutTime: r.checkOutTime,
      recordedBy: r.recordedBy,
      notes: r.notes,
      payAmount: r.payAmount,
      creditNote: r.creditNote,
      effectiveAmount: creditFor({
        payMode: r.payMode,
        status: (r.status ?? 'PENDING') as AttendanceStatus,
        payAmount: r.payAmount,
        eventDefault: event.payDefault,
      }),
    }))
    .sort(byName);

  const counts = data.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  // What the event currently owes in total, at today's figures.
  const totalPay = data.reduce((sum, row) => sum + (row.effectiveAmount ?? 0), 0);

  const rate =
    data.length > 0
      ? Math.round((((counts.PRESENT ?? 0) + (counts.LATE ?? 0)) / data.length) * 100)
      : 0;

  return (
    <>
      <PageHeader title={t.attendance.title} subtitle={t.attendance.subtitle} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatTile
          className="col-span-2 sm:col-span-1"
          label={t.attendance.totalTeam}
          value={data.length}
          hint={`${t.attendance.rate}: ${rate}%`}
        />
        <StatTile
          label={t.attendance.present}
          value={counts.PRESENT ?? 0}
          tone={counts.PRESENT ? 'ok' : 'neutral'}
        />
        <StatTile
          label={t.attendance.late}
          value={counts.LATE ?? 0}
          tone={counts.LATE ? 'warn' : 'neutral'}
        />
        <StatTile
          label={t.attendance.absent}
          value={counts.ABSENT ?? 0}
          tone={counts.ABSENT ? 'crit' : 'neutral'}
        />
        <StatTile
          label={t.attendance.excused}
          value={counts.EXCUSED ?? 0}
          tone={counts.EXCUSED ? 'info' : 'neutral'}
        />
      </div>

      {/*
        The days this event is worth, and what that adds up to across the team.
        It sits above the table because it is the number every row inherits.
      */}
      {scope.canManage ? (
        <EventCreditDefault
          t={t}
          eventId={eventId}
          value={event.payDefault}
          totalPay={totalPay}
        />
      ) : null}

      <AttendanceTable
        t={t}
        locale={locale}
        eventId={eventId}
        rows={data}
        canRecord
        canManage={scope.canManage}
        eventDefault={event.payDefault}
      />
    </>
  );
}
