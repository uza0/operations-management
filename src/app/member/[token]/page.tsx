import Link from 'next/link';
import type { Metadata } from 'next';

import { getT } from '@/lib/i18n/server';
import { getMemberPortal } from '@/server/services/member';
import { formatClock, formatDate, formatTime } from '@/lib/time';
import { format } from '@/lib/i18n';
import { Badge, attendanceTone, priorityTone } from '@/components/ui/status';
import {
  IconAlert,
  IconClock,
  IconMap,
  IconMegaphone,
  IconPin,
  IconTarget,
  IconUsers,
} from '@/components/ui/icons';
import type {
  AttendanceStatus,
  EventType,
  IssueStatus,
  IssueType,
  Priority,
  Task,
  TimelineStatus,
} from '@/lib/constants';

import { MemberIssueForm } from './MemberIssueForm';
import { MemberShell, InvalidToken } from './MemberShell';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The member portal (spec §4 / §19 / §37).
 *
 * Mobile-first and built around six questions, in this order: where do I go,
 * when do I arrive, what is my task, who is my leader, what are the latest
 * instructions, how do I report a problem. The three answers that matter in
 * the field are set in large type at the top, not behind a menu.
 */
export default async function MemberPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { locale, t } = await getT();
  const data = await getMemberPortal(token);

  if (!data) {
    return <InvalidToken title={t.member.invalidToken} hint={t.member.invalidTokenHint} />;
  }
  if (data.cancelled) {
    return <InvalidToken title={t.member.cancelled} hint={t.member.invalidTokenHint} />;
  }
  if (data.expired) {
    return <InvalidToken title={t.member.expiredToken} hint={t.member.invalidTokenHint} />;
  }

  const { membership, assignment } = data;
  const locationName = assignment?.gateName ?? assignment?.workingPointName ?? null;
  const urgent = data.announcements.filter((a) => a.priority === 'URGENT');
  const rest = data.announcements.filter((a) => a.priority !== 'URGENT');

  return (
    <MemberShell
      t={t}
      title={membership.eventName}
      subtitle={`${t.enums.eventType[membership.eventType as EventType]} · ${formatDate(
        membership.eventDate,
        locale,
      )}`}
      memberName={membership.memberName}
    >
      {/* Urgent first — an operations instruction beats layout tidiness. */}
      {urgent.length > 0 ? (
        <section className="space-y-2" aria-label={t.member.announcements}>
          {urgent.map((row) => (
            <div
              key={row.id}
              className="rounded-card border border-crit/60 bg-crit/12 p-4"
              role="alert"
            >
              <div className="mb-1 flex items-center gap-2">
                <IconAlert width={17} height={17} className="text-crit-text" />
                <span className="text-[12px] font-bold uppercase tracking-wide text-crit-text">
                  {t.enums.priority.URGENT}
                </span>
              </div>
              <p className="text-[15px] font-semibold text-ink-100">{row.title}</p>
              <p className="mt-1 whitespace-pre-line text-[14px] leading-6 text-ink-200">
                {row.message}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      {data.lastChange?.fromLocation && data.lastChange.toLocation ? (
        <div className="rounded-card border border-warn/50 bg-warn/10 px-4 py-3">
          <p className="text-[13px] font-semibold text-warn-text">
            {t.member.assignmentChanged}
          </p>
          <p className="mt-0.5 text-[13px] text-ink-200">
            {format(t.member.assignmentChangedHint, {
              from: data.lastChange.fromLocation,
              to: data.lastChange.toLocation,
            })}
          </p>
        </div>
      ) : null}

      {/* The three answers, in field-readable type ----------------------- */}
      {assignment ? (
        <section className="space-y-3">
          <div className="rounded-card border border-brand-500/35 bg-brand-500/10 p-5">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-brand-300">
              {t.member.yourLocation}
            </p>
            <p className="mt-1 text-[34px] font-bold leading-tight text-ink-100">
              {locationName}
            </p>
            {assignment.isGateLeader ? (
              <span className="mt-2 inline-flex">
                <Badge tone="brand">
                  <IconTarget width={13} height={13} />
                  {t.gate.gateLeader}
                </Badge>
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="panel p-4">
              <p className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
                {t.member.yourArrival}
              </p>
              <p className="nums mt-1 text-[26px] font-bold leading-tight text-ink-100">
                {formatTime(assignment.arrivalTime, locale)}
              </p>
            </div>
            <div className="panel p-4">
              <p className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
                {t.member.shift}
              </p>
              <p className="nums mt-1 text-[17px] font-semibold leading-tight text-ink-100">
                {formatTime(assignment.shiftStart, locale)}
                <br />
                {formatTime(assignment.shiftEnd, locale)}
              </p>
            </div>
          </div>

          <div className="panel p-5">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
              {t.member.yourTask}
            </p>
            <p className="mt-1 text-[22px] font-bold leading-tight text-ink-100">
              {t.enums.task[assignment.task as Task]}
            </p>
            {assignment.notes ? (
              <p className="mt-2 text-[13.5px] leading-6 text-ink-300">
                {assignment.notes}
              </p>
            ) : null}
          </div>
        </section>
      ) : (
        <div className="panel p-6 text-center">
          <p className="text-[16px] font-semibold text-ink-100">{t.member.noAssignment}</p>
          <p className="mt-1.5 text-[13.5px] leading-6 text-ink-400">
            {t.member.noAssignmentHint}
          </p>
        </div>
      )}

      {/* Who to report to ------------------------------------------------ */}
      <section className="panel divide-y divide-ink-800">
        {data.gateLeaderName ? (
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2 text-[13px] text-ink-400">
              <IconUsers width={16} height={16} className="text-ink-500" />
              {t.member.yourGateLeader}
            </span>
            <span className="text-[14px] font-semibold text-ink-100">
              {data.gateLeaderName}
            </span>
          </div>
        ) : null}
        {data.teamLeaderName ? (
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2 text-[13px] text-ink-400">
              <IconTarget width={16} height={16} className="text-ink-500" />
              {t.member.yourTeamLeader}
            </span>
            <span className="text-[14px] font-semibold text-ink-100">
              {data.teamLeaderName}
            </span>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-2 text-[13px] text-ink-400">
            <IconPin width={16} height={16} className="text-ink-500" />
            {t.member.venue}
          </span>
          <span className="text-end text-[14px] font-semibold text-ink-100">
            {membership.venueName}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-2 text-[13px] text-ink-400">
            <IconClock width={16} height={16} className="text-ink-500" />
            {t.event.kickoff}
          </span>
          <span className="nums text-[14px] font-semibold text-ink-100">
            {formatTime(membership.eventStart, locale)}
          </span>
        </div>
        {data.attendance ? (
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[13px] text-ink-400">{t.member.attendanceStatus}</span>
            <span className="flex items-center gap-2">
              {data.attendance.checkInAt ? (
                <span className="nums text-[12.5px] text-ink-400">
                  {formatClock(data.attendance.checkInAt, locale)}
                </span>
              ) : null}
              <Badge tone={attendanceTone[data.attendance.status as AttendanceStatus]}>
                {t.enums.attendanceStatus[data.attendance.status as AttendanceStatus]}
              </Badge>
            </span>
          </div>
        ) : null}
      </section>

      {/* Map ------------------------------------------------------------- */}
      {data.mapImageUrl ? (
        <Link
          href={`/member/${token}/map`}
          className="btn-secondary w-full justify-center py-3.5 text-[15px]"
        >
          <IconMap width={18} height={18} />
          {t.member.viewMap}
        </Link>
      ) : null}

      {/* Announcements --------------------------------------------------- */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-ink-100">
          <IconMegaphone width={17} height={17} className="text-ink-500" />
          {t.member.announcements}
        </h2>
        {rest.length === 0 && urgent.length === 0 ? (
          <p className="panel px-4 py-5 text-center text-[13.5px] text-ink-500">
            {t.member.noAnnouncements}
          </p>
        ) : (
          <ul className="space-y-2">
            {rest.map((row) => (
              <li key={row.id} className="panel p-4">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="text-[14.5px] font-semibold text-ink-100">{row.title}</p>
                  <Badge tone={priorityTone[row.priority as Priority]}>
                    {t.enums.priority[row.priority as Priority]}
                  </Badge>
                </div>
                <p className="whitespace-pre-line text-[13.5px] leading-6 text-ink-300">
                  {row.message}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Timeline -------------------------------------------------------- */}
      {data.timeline.length > 0 ? (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-ink-100">
            <IconClock width={17} height={17} className="text-ink-500" />
            {t.member.timeline}
          </h2>
          <ol className="panel divide-y divide-ink-800">
            {data.timeline.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="nums w-[66px] shrink-0 text-[13px] text-ink-400">
                  {formatTime(item.scheduledTime, locale)}
                </span>
                <span className="flex-1 truncate text-[13.5px] text-ink-200">
                  {item.title}
                </span>
                {item.status === 'ACTIVE' ? (
                  <Badge tone="ok" pulse>
                    {t.enums.timelineStatus[item.status as TimelineStatus]}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Report an issue -------------------------------------------------- */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-ink-100">
          <IconAlert width={17} height={17} className="text-ink-500" />
          {t.member.reportIssue}
        </h2>
        <MemberIssueForm t={t} token={token} />

        {data.myIssues.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {data.myIssues.map((row) => (
              <li key={row.id} className="panel px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13.5px] font-medium text-ink-100">
                    {t.enums.issueType[row.type as IssueType]}
                  </p>
                  <Badge
                    tone={
                      row.status === 'RESOLVED' || row.status === 'CLOSED'
                        ? 'ok'
                        : row.status === 'OPEN'
                          ? 'crit'
                          : 'info'
                    }
                  >
                    {t.enums.issueStatus[row.status as IssueStatus]}
                  </Badge>
                </div>
                <p className="mt-1 text-[12.5px] leading-5 text-ink-400">
                  {row.description}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <p className="pb-2 text-center text-[11.5px] text-ink-600">
        {t.member.savedOffline}
      </p>
    </MemberShell>
  );
}
