import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { announcements, issues, timelineItems } from '@/db/schema';
import { loadEventPage } from '@/features/event/workspace';
import { getEventSnapshot } from '@/server/services/events';
import { getStaffedLocations, summarizeStaffing } from '@/server/services/staffing';
import { listEventAudit } from '@/server/services/audit';
import { eventTeamLeaderId } from '@/server/services/access';
import { PageHeader, Panel, StatTile, KeyValue } from '@/components/ui/panel';
import { EmptyState, Notice } from '@/components/ui/states';
import {
  Badge,
  StaffingIndicator,
  attendanceTone,
  eventStatusTone,
  issueStatusTone,
  priorityTone,
  staffingTone,
  timelineTone,
} from '@/components/ui/status';
import { formatDate, formatDateTime, formatTime } from '@/lib/time';
import { format } from '@/lib/i18n';
import {
  type AttendanceStatus,
  type EventStatus,
  type EventType,
  type IssueStatus,
  type IssueType,
  type Priority,
  type TimelineStatus,
} from '@/lib/constants';
import {
  IconAlert,
  IconGate,
  IconMegaphone,
  IconUsers,
  IconCheckCircle,
} from '@/components/ui/icons';

import { EventLifecycle } from './parts/EventLifecycle';
import { EventReference } from './parts/EventReference';

export async function EventOverviewPage({
  base,
  eventId,
}: {
  base: '/admin' | '/leader';
  eventId: string;
}) {
  const { scope, event, locale, t } = await loadEventPage(eventId);

  const [snapshot, locations, audit, urgent, openIssues, timeline] = await Promise.all([
    getEventSnapshot(eventId),
    getStaffedLocations(eventId),
    listEventAudit(eventId, 6),
    db.query.announcements.findMany({
      where: eq(announcements.eventId, eventId),
      orderBy: [desc(announcements.createdAt)],
      limit: 3,
    }),
    db.query.issues.findMany({
      where: eq(issues.eventId, eventId),
      orderBy: [desc(issues.createdAt)],
      limit: 4,
    }),
    db.query.timelineItems.findMany({
      where: eq(timelineItems.eventId, eventId),
      orderBy: [timelineItems.scheduledTime],
    }),
  ]);

  const teamLeaderId = await eventTeamLeaderId(eventId);

  const staffing = summarizeStaffing(locations);
  const attendanceRate =
    snapshot.teamSize > 0
      ? Math.round(
          ((snapshot.attendance.PRESENT + snapshot.attendance.LATE) / snapshot.teamSize) *
            100,
        )
      : 0;

  const root = `${base}/events/${eventId}`;

  return (
    <>
      <PageHeader
        title={event.name}
        subtitle={`${t.enums.eventType[event.type as EventType]} · ${event.venue.name}`}
        action={
          <Badge
            tone={eventStatusTone[event.status as EventStatus]}
            pulse={event.status === 'LIVE'}
          >
            {t.enums.eventStatus[event.status as EventStatus]}
          </Badge>
        }
      />

      {/*
        Said here because this is the screen a supervisor opens, and because an
        event with nobody in charge looks completely normal until the night
        itself: the promoter's screen answers "report to: not set yet", and no
        account exists that can approve a single arrival.
      */}
      {scope.canManage && teamLeaderId === null ? (
        <div className="mb-4">
          <Notice tone="warn">
            <span className="font-semibold">{t.event.noLeaderTitle}</span> —{' '}
            {t.event.noLeaderBody}{' '}
            <Link href={`${root}/edit`} className="underline">
              {t.event.editEvent}
            </Link>
          </Notice>
        </div>
      ) : null}

      {staffing.understaffed.length > 0 ? (
        <div className="mb-4">
          <Notice tone="crit">
            <span className="font-semibold">{t.event.notReady}</span> —{' '}
            {t.event.notReadyDetail}{' '}
            {staffing.understaffed
              .map(
                (l) =>
                  `${l.name} (${l.assignedStaff}/${l.requiredStaff}، ${format(
                    t.gate.needsMore,
                    { n: l.difference },
                  )})`,
              )
              .join('، ')}{' '}
            <Link href={`${root}/assignments`} className="underline underline-offset-2">
              {t.assignment.title}
            </Link>
          </Notice>
        </div>
      ) : locations.length > 0 ? (
        <div className="mb-4">
          <Notice tone="ok">{t.event.readyToGo}</Notice>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatTile
          className="col-span-2 sm:col-span-1"
          label={t.event.teamSize}
          value={snapshot.teamSize}
          hint={`${t.eventTeam.reserve}: ${snapshot.reserveCount}`}
          icon={<IconUsers width={16} height={16} />}
        />
        <StatTile
          label={t.event.gatesCount}
          value={snapshot.gateCount}
          hint={`${t.gate.workingPoints}: ${snapshot.workingPointCount}`}
          icon={<IconGate width={16} height={16} />}
        />
        <StatTile
          label={t.attendance.present}
          value={snapshot.attendance.PRESENT}
          tone={snapshot.attendance.PRESENT ? 'ok' : 'neutral'}
          hint={`${t.attendance.rate}: ${attendanceRate}%`}
          icon={<IconCheckCircle width={16} height={16} />}
        />
        <StatTile
          label={t.dashboard.openIssues}
          value={snapshot.openIssues}
          tone={snapshot.openIssues ? 'crit' : 'ok'}
          icon={<IconAlert width={16} height={16} />}
        />
        <StatTile
          label={t.announcement.title}
          value={snapshot.announcementCount}
          icon={<IconMegaphone width={16} height={16} />}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Gate staffing ------------------------------------------------ */}
          <Panel
            title={t.gate.staffingTitle}
            subtitle={`${t.gate.assignedStaff}: ${staffing.assigned} / ${staffing.required}`}
            action={
              <Link href={`${root}/gates`} className="btn-ghost btn-sm">
                {t.common.view}
              </Link>
            }
            bodyClassName="p-4 sm:p-5"
          >
            {locations.length === 0 ? (
              <EmptyState
                title={t.gate.emptyGates}
                hint={t.gate.emptyGatesHint}
                icon={<IconGate width={20} height={20} />}
                action={
                  scope.canManage ? (
                    <Link href={`${root}/gates`} className="btn-primary btn-sm">
                      {t.gate.newGate}
                    </Link>
                  ) : null
                }
              />
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {locations.map((location) => (
                  <li
                    key={location.id}
                    className="rounded-lg border border-ink-700 bg-ink-850/60 p-3"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="truncate text-[14px] font-semibold text-ink-100">
                        {location.name}
                      </p>
                      <Badge tone="neutral" dot={false}>
                        {location.kind === 'GATE'
                          ? t.enums.gateType[
                              location.type as keyof typeof t.enums.gateType
                            ]
                          : t.enums.workingPointType[
                              location.type as keyof typeof t.enums.workingPointType
                            ]}
                      </Badge>
                    </div>
                    <StaffingIndicator
                      assigned={location.assignedStaff}
                      required={location.requiredStaff}
                      level={location.level}
                      label={t.enums.staffing[location.level]}
                      detail={
                        location.difference > 0
                          ? format(t.gate.needsMore, { n: location.difference })
                          : location.difference < 0
                            ? format(t.gate.extraStaff, { n: -location.difference })
                            : t.gate.complete
                      }
                      compact
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Recent activity --------------------------------------------- */}
          <Panel
            title={t.dashboard.recentActivity}
            action={
              scope.canManage ? (
                <Link href={`${root}/activity`} className="btn-ghost btn-sm">
                  {t.common.view}
                </Link>
              ) : null
            }
            bodyClassName="p-0"
          >
            {audit.length === 0 ? (
              <EmptyState title={t.audit.empty} hint={t.audit.emptyHint} />
            ) : (
              <ul className="divide-y divide-ink-800">
                {audit.map((row) => (
                  <li key={row.id} className="px-4 py-3">
                    <p className="text-[13.5px] leading-5 text-ink-200">{row.summary}</p>
                    <p className="mt-1 text-[12.5px] text-ink-500">
                      {row.actorName} ·{' '}
                      <span className="nums">{formatDateTime(row.createdAt, locale)}</span>
                      {row.reason ? ` · ${t.common.reason}: ${row.reason}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          {/* Event info --------------------------------------------------- */}
          <Panel
            title={t.report.eventInfo}
            action={
              scope.canManage ? (
                <Link href={`${root}/edit`} className="btn-ghost btn-sm">
                  {t.event.editEvent}
                </Link>
              ) : null
            }
          >
            <dl>
              <KeyValue label={t.event.venue}>{event.venue.name}</KeyValue>
              <KeyValue label={t.event.date}>
                <span className="nums">{formatDate(event.date, locale)}</span>
              </KeyValue>
              <KeyValue label={t.event.arrival}>
                <span className="nums">{formatTime(event.teamArrivalTime, locale)}</span>
              </KeyValue>
              <KeyValue label={t.event.kickoff}>
                <span className="nums">{formatTime(event.startTime, locale)}</span>
              </KeyValue>
              <KeyValue label={t.attendance.title}>
                <span className="flex flex-wrap justify-end gap-1.5">
                  {(['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as AttendanceStatus[]).map(
                    (status) => (
                      <Badge key={status} tone={attendanceTone[status]}>
                        {t.enums.attendanceStatus[status]}{' '}
                        <span className="nums">{snapshot.attendance[status] ?? 0}</span>
                      </Badge>
                    ),
                  )}
                </span>
              </KeyValue>
            </dl>
            {event.description ? (
              <p className="mt-3 border-t border-ink-800 pt-3 text-[13px] leading-6 text-ink-300">
                {event.description}
              </p>
            ) : null}
          </Panel>

          {/*
            The company's own number for the event, kept where it is read and
            editable at every stage — it arrives on its own schedule, often
            after the night is over.
          */}
          {scope.canManage ? (
            <Panel title={t.event.externalId}>
              <EventReference
                t={t}
                eventId={eventId}
                value={event.externalId ?? null}
              />
            </Panel>
          ) : null}

          {scope.canManage ? (
            <Panel title={t.event.lifecycle}>
              <EventLifecycle t={t} eventId={eventId} status={event.status as EventStatus} />
            </Panel>
          ) : null}

          {/* Announcements ------------------------------------------------ */}
          <Panel
            title={t.announcement.title}
            action={
              <Link href={`${root}/announcements`} className="btn-ghost btn-sm">
                {t.common.view}
              </Link>
            }
            bodyClassName="p-0"
          >
            {urgent.length === 0 ? (
              <EmptyState title={t.announcement.empty} hint={t.announcement.emptyHint} />
            ) : (
              <ul className="divide-y divide-ink-800">
                {urgent.map((row) => (
                  <li key={row.id} className="px-4 py-3">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <p className="text-[13.5px] font-semibold text-ink-100">
                        {row.title}
                      </p>
                      <Badge tone={priorityTone[row.priority as Priority]}>
                        {t.enums.priority[row.priority as Priority]}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-[12.5px] leading-5 text-ink-400">
                      {row.message}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Issues ------------------------------------------------------- */}
          <Panel
            title={t.issue.title}
            action={
              <Link href={`${root}/issues`} className="btn-ghost btn-sm">
                {t.common.view}
              </Link>
            }
            bodyClassName="p-0"
          >
            {openIssues.length === 0 ? (
              <EmptyState title={t.issue.empty} hint={t.issue.emptyHint} />
            ) : (
              <ul className="divide-y divide-ink-800">
                {openIssues.map((row) => (
                  <li key={row.id} className="px-4 py-3">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <p className="text-[13.5px] font-semibold text-ink-100">
                        {t.enums.issueType[row.type as IssueType]}
                      </p>
                      <Badge tone={issueStatusTone[row.status as IssueStatus]}>
                        {t.enums.issueStatus[row.status as IssueStatus]}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-[12.5px] leading-5 text-ink-400">
                      {row.description}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Timeline ----------------------------------------------------- */}
          {timeline.length > 0 ? (
            <Panel
              title={t.timeline.title}
              action={
                scope.canManage ? (
                  <Link href={`${root}/timeline`} className="btn-ghost btn-sm">
                    {t.common.view}
                  </Link>
                ) : null
              }
              bodyClassName="p-4"
            >
              <ol className="space-y-2.5">
                {timeline.slice(0, 6).map((item) => (
                  <li key={item.id} className="flex items-center gap-3">
                    <span className="nums w-[62px] shrink-0 text-[12.5px] text-ink-400">
                      {formatTime(item.scheduledTime, locale)}
                    </span>
                    <span className="flex-1 truncate text-[13px] text-ink-200">
                      {item.title}
                    </span>
                    <Badge tone={timelineTone[item.status as TimelineStatus]}>
                      {t.enums.timelineStatus[item.status as TimelineStatus]}
                    </Badge>
                  </li>
                ))}
              </ol>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}

export { staffingTone };
