import { asc, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  announcements,
  assignmentChanges,
  assignments,
  attendance,
  eventMembers,
  issues,
  teamMembers,
  timelineItems,
} from '@/db/schema';
import { loadEventPage } from '@/features/event/workspace';
import { getStaffedLocations } from '@/server/services/staffing';
import { listAssignments } from '@/server/services/assignments';
import { PageHeader, Panel, KeyValue, StatTile } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/states';
import { Badge, eventStatusTone, issueStatusTone } from '@/components/ui/status';
import { formatDate, formatDateTime, formatTime } from '@/lib/time';
import {
  type AttendanceStatus,
  type EventStatus,
  type EventType,
  type IssueStatus,
  type IssueType,
  type Priority,
  type Task,
} from '@/lib/constants';

import { PrintButton, ReportNotes } from './parts/ReportParts';

/** Basic event report (spec §27). Print-friendly; the browser exports the PDF. */
export async function EventReportPage({ eventId }: { eventId: string }) {
  const { scope, event, locale, t } = await loadEventPage(eventId);

  const [
    locations,
    assignmentRows,
    members,
    attendanceRows,
    issueRows,
    announcementRows,
    changeRows,
    timeline,
  ] = await Promise.all([
    getStaffedLocations(eventId),
    listAssignments(eventId),
    db
      .select({ id: eventMembers.id, isReserve: eventMembers.isReserve })
      .from(eventMembers)
      .where(eq(eventMembers.eventId, eventId)),
    db
      .select({ status: attendance.status })
      .from(attendance)
      .where(eq(attendance.eventId, eventId)),
    db
      .select()
      .from(issues)
      .where(eq(issues.eventId, eventId))
      .orderBy(desc(issues.createdAt)),
    db
      .select()
      .from(announcements)
      .where(eq(announcements.eventId, eventId))
      .orderBy(desc(announcements.createdAt)),
    db
      .select({
        id: assignmentChanges.id,
        fromLocation: assignmentChanges.fromLocation,
        toLocation: assignmentChanges.toLocation,
        reason: assignmentChanges.reason,
        changedByName: assignmentChanges.changedByName,
        createdAt: assignmentChanges.createdAt,
        memberName: teamMembers.fullName,
      })
      .from(assignmentChanges)
      .innerJoin(assignments, eq(assignmentChanges.assignmentId, assignments.id))
      .innerJoin(eventMembers, eq(assignments.eventMemberId, eventMembers.id))
      .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
      .where(eq(assignments.eventId, eventId))
      .orderBy(desc(assignmentChanges.createdAt)),
    db
      .select()
      .from(timelineItems)
      .where(eq(timelineItems.eventId, eventId))
      .orderBy(asc(timelineItems.scheduledTime)),
  ]);

  const counts: Record<string, number> = {
    PRESENT: 0,
    LATE: 0,
    ABSENT: 0,
    EXCUSED: 0,
    PENDING: 0,
  };
  for (const row of attendanceRows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  counts.PENDING += members.length - attendanceRows.length;

  const activeAssignments = assignmentRows.filter((a) => a.status !== 'CANCELLED');
  const byTask = activeAssignments.reduce<Record<string, number>>((acc, a) => {
    acc[a.task] = (acc[a.task] ?? 0) + 1;
    return acc;
  }, {});

  const attendanceRate =
    members.length > 0
      ? Math.round(((counts.PRESENT + counts.LATE) / members.length) * 100)
      : 0;

  return (
    <>
      <PageHeader
        title={t.report.title}
        subtitle={`${event.name} · ${formatDate(event.date, locale)}`}
        action={<PrintButton label={t.report.printReport} />}
      />

      <div className="space-y-4">
        <Panel title={t.report.eventInfo}>
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <dl>
              <KeyValue label={t.event.name}>{event.name}</KeyValue>
              <KeyValue label={t.event.type}>
                {t.enums.eventType[event.type as EventType]}
              </KeyValue>
              <KeyValue label={t.event.venue}>{event.venue.name}</KeyValue>
              <KeyValue label={t.common.status}>
                <Badge tone={eventStatusTone[event.status as EventStatus]}>
                  {t.enums.eventStatus[event.status as EventStatus]}
                </Badge>
              </KeyValue>
            </dl>
            <dl>
              <KeyValue label={t.event.date}>
                <span className="nums">{formatDate(event.date, locale)}</span>
              </KeyValue>
              <KeyValue label={t.event.arrival}>
                <span className="nums">{formatTime(event.teamArrivalTime, locale)}</span>
              </KeyValue>
              <KeyValue label={t.event.kickoff}>
                <span className="nums">{formatTime(event.startTime, locale)}</span>
              </KeyValue>
              <KeyValue label={t.report.generatedAt}>
                <span className="nums">{formatDateTime(new Date(), locale)}</span>
              </KeyValue>
            </dl>
          </div>
        </Panel>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
          <StatTile label={t.event.teamSize} value={members.length} />
          <StatTile
            label={t.attendance.present}
            value={counts.PRESENT}
            tone={counts.PRESENT ? 'ok' : 'neutral'}
            hint={`${t.attendance.rate}: ${attendanceRate}%`}
          />
          <StatTile
            label={t.attendance.late}
            value={counts.LATE}
            tone={counts.LATE ? 'warn' : 'neutral'}
          />
          <StatTile
            label={t.attendance.absent}
            value={counts.ABSENT}
            tone={counts.ABSENT ? 'crit' : 'neutral'}
          />
          <StatTile label={t.event.gatesCount} value={locations.length} />
          <StatTile
            label={t.issue.title}
            value={issueRows.length}
            tone={issueRows.some((i) => i.status === 'OPEN') ? 'crit' : 'neutral'}
          />
        </div>

        <Panel title={t.report.gateDistribution} bodyClassName="p-0">
          {locations.length === 0 ? (
            <EmptyState title={t.gate.emptyGates} />
          ) : (
            <div className="table-wrap">
              <table className="op-table op-table-stack">
                <thead>
                  <tr>
                    <th>{t.assignment.location}</th>
                    <th>{t.gate.requiredStaff}</th>
                    <th>{t.gate.assignedStaff}</th>
                    <th>{t.gate.difference}</th>
                    <th>{t.common.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((l) => (
                    <tr key={l.id}>
                      <td data-label="" className="font-medium text-ink-100">
                        {l.name}
                      </td>
                      <td data-label={t.gate.requiredStaff} className="nums text-ink-300">
                        {l.requiredStaff}
                      </td>
                      <td data-label={t.gate.assignedStaff} className="nums text-ink-300">
                        {l.assignedStaff}
                      </td>
                      <td data-label={t.gate.difference} className="nums text-ink-300">
                        {l.difference > 0 ? `-${l.difference}` : l.difference < 0 ? `+${-l.difference}` : '0'}
                      </td>
                      <td data-label={t.common.status}>
                        <Badge
                          tone={
                            l.level === 'UNDERSTAFFED'
                              ? 'crit'
                              : l.level === 'OVERSTAFFED'
                                ? 'warn'
                                : 'ok'
                          }
                        >
                          {t.enums.staffing[l.level]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title={t.report.assignmentSummary}>
            {Object.keys(byTask).length === 0 ? (
              <EmptyState title={t.assignment.empty} />
            ) : (
              <dl>
                {Object.entries(byTask)
                  .sort((a, b) => b[1] - a[1])
                  .map(([task, count]) => (
                    <KeyValue key={task} label={t.enums.task[task as Task]}>
                      <span className="nums">{count}</span>
                    </KeyValue>
                  ))}
                <KeyValue label={t.common.total}>
                  <span className="nums">{activeAssignments.length}</span>
                </KeyValue>
              </dl>
            )}
          </Panel>

          <Panel title={t.report.attendanceSummary}>
            <dl>
              {(['PRESENT', 'LATE', 'ABSENT', 'EXCUSED', 'PENDING'] as AttendanceStatus[]).map(
                (status) => (
                  <KeyValue key={status} label={t.enums.attendanceStatus[status]}>
                    <span className="nums">{counts[status] ?? 0}</span>
                  </KeyValue>
                ),
              )}
            </dl>
          </Panel>
        </div>

        <Panel title={t.report.changesSummary} bodyClassName="p-0">
          {changeRows.length === 0 ? (
            <EmptyState title={t.assignment.noChanges} />
          ) : (
            <ul className="divide-y divide-ink-800">
              {changeRows.map((row) => (
                <li key={row.id} className="px-4 py-3">
                  <p className="text-[13.5px] text-ink-100">
                    {row.memberName}
                    {row.fromLocation && row.toLocation
                      ? `: ${row.fromLocation} → ${row.toLocation}`
                      : ''}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-500">
                    {t.common.by} {row.changedByName} ·{' '}
                    <span className="nums">{formatDateTime(row.createdAt, locale)}</span>
                    {row.reason ? ` · ${t.common.reason}: ${row.reason}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title={t.report.issuesSummary} bodyClassName="p-0">
            {issueRows.length === 0 ? (
              <EmptyState title={t.issue.empty} />
            ) : (
              <ul className="divide-y divide-ink-800">
                {issueRows.map((row) => (
                  <li key={row.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13.5px] font-medium text-ink-100">
                        {t.enums.issueType[row.type as IssueType]}
                      </p>
                      <Badge tone={issueStatusTone[row.status as IssueStatus]}>
                        {t.enums.issueStatus[row.status as IssueStatus]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-5 text-ink-400">
                      {row.description}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t.report.announcementsSummary} bodyClassName="p-0">
            {announcementRows.length === 0 ? (
              <EmptyState title={t.announcement.empty} />
            ) : (
              <ul className="divide-y divide-ink-800">
                {announcementRows.map((row) => (
                  <li key={row.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13.5px] font-medium text-ink-100">{row.title}</p>
                      <Badge
                        tone={
                          row.priority === 'URGENT'
                            ? 'crit'
                            : row.priority === 'IMPORTANT'
                              ? 'warn'
                              : 'neutral'
                        }
                      >
                        {t.enums.priority[row.priority as Priority]}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[12px] text-ink-500">
                      {row.createdByName} ·{' '}
                      <span className="nums">{formatDateTime(row.createdAt, locale)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {timeline.length > 0 ? (
          <Panel title={t.report.timelineSummary} bodyClassName="p-4">
            <ol className="space-y-2">
              {timeline.map((item) => (
                <li key={item.id} className="flex items-center gap-3 text-[13px]">
                  <span className="nums w-[72px] shrink-0 text-ink-400">
                    {formatTime(item.scheduledTime, locale)}
                  </span>
                  <span className="flex-1 text-ink-200">{item.title}</span>
                  <span className="text-[12px] text-ink-500">
                    {t.enums.timelineStatus[item.status as keyof typeof t.enums.timelineStatus]}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        ) : null}

        <Panel title={t.report.operationalNotes}>
          <ReportNotes
            t={t}
            eventId={eventId}
            value={event.reportNotes}
            canManage={scope.canManage}
          />
        </Panel>
      </div>
    </>
  );
}
