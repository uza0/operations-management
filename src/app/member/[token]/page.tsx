import type { Metadata } from 'next';

import { getT } from '@/lib/i18n/server';
import { getMemberPortal } from '@/server/services/member';
import { formatDate, formatDateTime, formatTime } from '@/lib/time';
import { format } from '@/lib/i18n';
import { plural } from '@/lib/plural';
import { Badge, attendanceTone, priorityTone } from '@/components/ui/status';

import { FeedbackForm } from './FeedbackForm';
import {
  IconAlert,
  IconCalendar,
  IconClock,
  IconMegaphone,
  IconPin,
  IconTarget,
  IconUsers,
} from '@/components/ui/icons';
import type {
  AttendanceStatus,
  EventRole,
  EventType,
  IssueStatus,
  IssueType,
  Priority,
  Task,
  TimelineStatus,
} from '@/lib/constants';

import { InvitationScreen } from './InvitationScreen';
import { SeatSetupCard } from './SeatSetupCard';
import { ArrivalButton, DepartureButton } from './ArrivalActions';
import { MemberIssueForm } from './MemberIssueForm';
import { MemberIssueCard } from './MemberIssueCard';
import { MemberShell, InvalidToken } from './MemberShell';

/** "يومين و٤ ساعات" — a span a person reads, not a number of minutes. */
function formatSpan(ms: number, t: Awaited<ReturnType<typeof getT>>['t']): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(plural(t.member.spanDays, days));
  if (hours > 0) parts.push(plural(t.member.spanHours, hours));
  if (days === 0 && hours === 0) parts.push(plural(t.member.spanMinutes, mins));
  return parts.join(' ');
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** One labelled fact in a stacked list. */
function Fact({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="flex shrink-0 items-center gap-2 text-[13px] text-ink-400">
        {icon}
        {label}
      </span>
      <span className="min-w-0 text-end text-[14px] font-semibold text-ink-100">
        {children}
      </span>
    </div>
  );
}

/**
 * The member portal (spec §4 / §19 / §37).
 *
 * Mobile-first, and ordered by the questions a promoter actually asks, in the
 * order they ask them: which event is this and where is it, who am I on it,
 * what has changed since I last looked, where do I stand and what do I do,
 * who do I report to, how do I get there, what are the instructions, and how
 * do I report a problem.
 *
 * The event used to live in the top bar, in 15px type between a greeting and a
 * subtitle, while the venue and kick-off sat in a list halfway down the page —
 * so the two facts a person needs while they are still deciding which bus to
 * take were the two smallest and most scattered things on the screen. They are
 * now one card, first, in type that reads at arm's length. The bar carries
 * only the product.
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

  /*
   * What this person is, in one phrase. Everyone in the field is a promoter;
   * a specific role replaces that title rather than sitting beside it, because
   * two job titles on one badge is how a gate leader ends up unsure whether
   * they are running the gate.
   */
  /*
   * The deadline is formatted here, not on the phone. A device with the wrong
   * clock — and at a venue there is always one — would otherwise show its own
   * idea of how long is left.
   */
  const now = Date.now();
  const respondBy = data.invitation.respondBy;
  const overdue = Boolean(
    respondBy && !data.invitation.confirmedAt && respondBy.getTime() < now,
  );
  const deadline =
    respondBy && !overdue
      ? {
          left: formatSpan(respondBy.getTime() - now, t),
          at: formatDateTime(respondBy, locale),
        }
      : null;

  const positionLabel =
    membership.eventRole && membership.eventRole in t.enums.eventRole
      ? t.enums.eventRole[membership.eventRole as EventRole]
      : assignment?.isGateLeader
        ? t.gate.gateLeader
        : t.team.promoter;

  return (
    <MemberShell>
      <div className="stagger space-y-4">
        {/* 1 — which event, and where ---------------------------------- */}
        <section className="rounded-card border border-ink-700 bg-ink-900 shadow-panel">
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">
                {t.enums.eventType[membership.eventType as EventType]}
              </Badge>
              {membership.isReserve ? (
                <Badge tone="warn">{t.eventTeam.reserve}</Badge>
              ) : null}
            </div>

            <h1 className="mt-2.5 text-[27px] font-extrabold leading-[1.15] text-ink-100">
              {membership.eventName}
            </h1>

            <p className="mt-2 flex items-start gap-2 text-[15px] font-semibold text-ink-200">
              <IconPin width={17} height={17} className="mt-0.5 shrink-0 text-brand-600" />
              <span className="min-w-0">
                {membership.venueName}
                {membership.venueAddress ? (
                  <span className="mt-0.5 block text-[12.5px] font-normal text-ink-500">
                    {membership.venueAddress}
                  </span>
                ) : null}
              </span>
            </p>
          </div>

          {/* The two numbers that decide when to leave the house. */}
          <div className="grid grid-cols-2 divide-x divide-ink-700 border-t border-ink-700 rtl:divide-x-reverse">
            <div className="px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
                <IconCalendar width={13} height={13} />
                {t.member.date}
              </p>
              <p className="mt-1 text-[14px] font-semibold text-ink-100">
                {formatDate(membership.eventDate, locale)}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
                <IconClock width={13} height={13} />
                {t.event.kickoff}
              </p>
              <p className="nums mt-1 text-[14px] font-semibold text-ink-100">
                {formatTime(membership.eventStart, locale)}
              </p>
            </div>
          </div>

          {membership.venueLocationUrl ? (
            <div className="border-t border-ink-700 p-3">
              <a
                href={membership.venueLocationUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-primary w-full justify-center py-3 text-[15px]"
              >
                <IconPin width={18} height={18} />
                {t.member.openInMaps}
              </a>
            </div>
          ) : null}
        </section>

        {/*
          2 — the question of the moment.

          One of these, never two. Before he has answered there is nothing to
          ask but the invitation; once the hour comes there is nothing to ask
          but whether he is here; and once he is confirmed present the evening
          is open. See src/lib/journey.ts.
        */}
        {data.stage === 'INVITED' ? (
          <InvitationScreen
            t={t}
            token={token}
            pay={data.invitation.payAmount}
            currency={t.credit.currency}
            deadline={deadline}
            urgent={data.invitation.respondBy === null && data.invitation.confirmedAt === null}
            overdue={overdue}
          />
        ) : null}

        {data.stage === 'CLOSED' ? (
          <section className="rounded-card border border-ink-700 bg-ink-850 p-5 text-center">
            <p className="text-[16px] font-bold text-ink-100">{t.journey.closedTitle}</p>
            <p className="mt-1.5 text-[13px] leading-6 text-ink-400">
              {t.journey.closedHint}
            </p>
          </section>
        ) : null}

        {data.stage === 'ARRIVING' ? (
          <ArrivalButton t={t} token={token} />
        ) : null}

        {data.stage === 'AWAITING_APPROVAL' ? (
          <section className="rise rounded-card border border-warn/40 bg-warn/10 p-4 text-center">
            <p className="text-[14.5px] font-semibold text-ink-100">
              {format(t.journey.arrivalWaiting, {
                time: formatTime(data.attendance?.checkInTime ?? '', locale),
              })}
            </p>
          </section>
        ) : null}

        {data.stage === 'AFTER' ? (
          <section className="rounded-card border border-ink-700 bg-ink-850 p-4 text-center">
            <p className="text-[15px] font-bold text-ink-100">{t.journey.thanksTitle}</p>
            <p className="mt-1 text-[12.5px] leading-6 text-ink-400">
              {t.journey.thanksHint}
            </p>
          </section>
        ) : null}

        {/* 2b — who I am on this event --------------------------------- */}
        <section className="flex items-center gap-3 rounded-card border border-ink-700 bg-ink-850 px-4 py-3.5">
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-600 text-[16px] font-extrabold text-white"
          >
            {membership.memberName.trim().charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-bold text-ink-100">
              {membership.memberName}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-ink-400">
              <span className="font-semibold text-brand-900">{positionLabel}</span>
              <span aria-hidden className="text-ink-600">·</span>
              <span className="nums">{membership.memberCode}</span>
            </p>
          </div>
        </section>

        {/* 3 — anything that changed since they last looked ------------- */}
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

        {/* 4 — the earlier shift, when there is one --------------------- */}
        {data.mainGate ? (
          <section className="rounded-card border border-warn/40 bg-warn/10 p-4">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-warn-text">
              {t.mainGate.memberTitle}
            </p>
            <p className="mt-1 text-[20px] font-bold leading-tight text-ink-100">
              {data.mainGate.name}
            </p>
            <p className="nums mt-1 text-[15px] font-semibold text-ink-100">
              {formatTime(data.mainGate.startTime, locale)} –{' '}
              {formatTime(data.mainGate.endTime, locale)}
            </p>
            <p className="mt-1 text-[13.5px] text-ink-200">
              {t.enums.task[data.mainGate.task]}
            </p>
            <p className="mt-2 text-[12.5px] leading-5 text-ink-400">
              {t.mainGate.memberHint}
            </p>
            {data.mainGate.notes ? (
              <p className="mt-1 text-[12.5px] leading-5 text-ink-400">
                {data.mainGate.notes}
              </p>
            ) : null}
          </section>
        ) : null}

        {/* 4b — the days before, for whoever sets out the chairs -------- */}
        {data.seatSetup.length > 0 ? (
          <section className="rounded-card border border-ink-700 bg-ink-850 p-4">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-400">
              {t.seatSetup.memberTitle}
            </p>
            {/*
              One card per day, each with its own question on it. A big hall is
              built over two or three afternoons, a man can be free for one of
              them and not the next, and the fee is per day — so each day is
              invited, answered and attended by itself.
            */}
            <ul className="mt-2 space-y-2.5">
              {data.seatSetup.map((shift) => (
                <SeatSetupCard
                  key={shift.id}
                  t={t}
                  token={token}
                  seatMemberId={shift.id}
                  stage={shift.stage}
                  when={formatDate(shift.date, locale)}
                  hours={
                    formatTime(shift.startTime, locale) +
                    (shift.endTime ? ` – ${formatTime(shift.endTime, locale)}` : '')
                  }
                  notes={shift.notes}
                  pay={shift.payAmount}
                  currency={t.credit.currency}
                  arrivedAt={
                    shift.checkInTime ? formatTime(shift.checkInTime, locale) : null
                  }
                />
              ))}
            </ul>
            <p className="mt-2 text-[12.5px] leading-5 text-ink-400">
              {t.seatSetup.memberHint}
            </p>
          </section>
        ) : null}

        {/* 5 — where I stand and what I do ----------------------------- */}
        {assignment ? (
          <section>
            <h2 className="mb-2 flex items-center gap-2 px-1 text-[15px] font-bold text-ink-100">
              <IconTarget width={17} height={17} className="text-brand-600" />
              {t.member.onDuty}
            </h2>

            <div className="overflow-hidden rounded-card border border-brand-600/35 bg-brand-50">
              <div className="p-5">
                <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-brand-900">
                  {t.member.yourLocation}
                </p>
                <p className="mt-1 text-[34px] font-extrabold leading-[1.1] text-ink-100">
                  {locationName}
                </p>
                <p className="mt-2 text-[12px] font-bold uppercase tracking-[0.12em] text-brand-900">
                  {t.member.yourTask}
                </p>
                <p className="mt-0.5 text-[20px] font-bold leading-tight text-ink-100">
                  {t.enums.task[assignment.task as Task]}
                </p>
                {assignment.notes ? (
                  <p className="mt-2 text-[13.5px] leading-6 text-ink-300">
                    {assignment.notes}
                  </p>
                ) : null}
              </div>

              {/*
               * Arrival and shift belong together: the first is a single
               * instant and the one thing a promoter is held to, the second is
               * the span it opens. Splitting them into two cards made them
               * look like unrelated facts, and the arrival time repeated as
               * the start of the shift looked like a bug.
               */}
              <div className="grid grid-cols-2 divide-x divide-brand-600/20 border-t border-brand-600/20 bg-ink-900 rtl:divide-x-reverse">
                <div className="px-4 py-3">
                  <p className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
                    {t.member.yourArrival}
                  </p>
                  <p className="nums mt-1 text-[24px] font-extrabold leading-tight text-ink-100">
                    {formatTime(assignment.arrivalTime, locale)}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
                    {t.member.yourShift}
                  </p>
                  <p className="nums mt-1 text-[15px] font-semibold leading-tight text-ink-100">
                    {formatTime(assignment.shiftStart, locale)} –{' '}
                    {formatTime(assignment.shiftEnd, locale)}
                  </p>
                </div>
              </div>
            </div>
          </section>
        ) : (
          /*
           * Two different silences, and telling them apart is the whole
           * point. "The board is still being arranged" says the wait is
           * normal and nothing is required of him; "you have no place yet"
           * says the board is finished and he is not on it, which is worth a
           * phone call to his leader. One message for both left everyone
           * calling, or nobody.
           */
          <div className="panel p-6 text-center">
            <p className="text-[16px] font-semibold text-ink-100">
              {data.boardPublished ? t.member.noAssignment : t.member.boardDraft}
            </p>
            <p className="mt-1.5 text-[13.5px] leading-6 text-ink-400">
              {data.boardPublished ? t.member.noAssignmentHint : t.member.boardDraftHint}
            </p>
          </div>
        )}

        {/* 6 — who I report to ------------------------------------------ */}
        <section>
          <h2 className="mb-2 flex items-center gap-2 px-1 text-[15px] font-bold text-ink-100">
            <IconUsers width={17} height={17} className="text-ink-500" />
            {t.member.reportTo}
          </h2>
          <div className="panel divide-y divide-ink-700">
            <Fact
              icon={<IconUsers width={16} height={16} className="text-ink-500" />}
              label={t.member.yourGateLeader}
            >
              {data.gateLeaderName ?? (
                <span className="font-normal text-ink-500">{t.member.noLeaderYet}</span>
              )}
            </Fact>
            <Fact
              icon={<IconTarget width={16} height={16} className="text-ink-500" />}
              label={t.member.yourTeamLeader}
            >
              {data.teamLeaderName ?? (
                <span className="font-normal text-ink-500">{t.member.noLeaderYet}</span>
              )}
            </Fact>
            {data.attendance ? (
              <Fact
                icon={<IconClock width={16} height={16} className="text-ink-500" />}
                label={t.member.attendanceStatus}
              >
                <span className="inline-flex items-center gap-2">
                  {data.attendance.checkInTime ? (
                    <span className="nums text-[12.5px] font-normal text-ink-400">
                      {formatTime(data.attendance.checkInTime, locale)}
                    </span>
                  ) : null}
                  <Badge tone={attendanceTone[data.attendance.status as AttendanceStatus]}>
                    {t.enums.attendanceStatus[data.attendance.status as AttendanceStatus]}
                  </Badge>
                </span>
              </Fact>
            ) : null}
          </div>
        </section>

        {/*
          7 — there is no site plan here, deliberately.
          --------------------------------------------------------------
          The venue's own location is up in the event card, because it is
          what somebody needs while deciding which bus to take. The plan of
          the site is a different thing: it shows every gate, every working
          point and who is on them, and that is the team's distribution, not
          one promoter's business. He is told his own place, his own task and
          the name of the person he reports to; where everybody else is
          standing is for the people running the evening.
        */}

        {/* 8 — instructions --------------------------------------------- */}
        <section>
          <h2 className="mb-2 flex items-center gap-2 px-1 text-[15px] font-bold text-ink-100">
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

        {/* 9 — the evening's running order ------------------------------ */}
        {data.timeline.length > 0 ? (
          <section>
            <h2 className="mb-2 flex items-center gap-2 px-1 text-[15px] font-bold text-ink-100">
              <IconClock width={17} height={17} className="text-ink-500" />
              {t.member.timeline}
            </h2>
            <ol className="panel divide-y divide-ink-700">
              {data.timeline.map((item) => (
                <li
                  key={item.id}
                  className={`flex items-center gap-3 px-4 py-2.5 ${
                    item.status === 'ACTIVE' ? 'bg-ok-soft' : ''
                  }`}
                >
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

        {/*
          10 — reporting a problem, once he is actually on duty.

          Not a tidiness rule. "The scanner is dead" from a man at home the
          day before burns a two-minute response target at a gate leader who
          cannot act on it, and the promise that a critical report is answered
          in two minutes is only worth making if the reports are real.
        */}
        {data.stage === 'ON_DUTY' || data.stage === 'AFTER' ? (
        <section>
          <h2 className="mb-2 flex items-center gap-2 px-1 text-[15px] font-bold text-ink-100">
            <IconAlert width={17} height={17} className="text-ink-500" />
            {t.member.reportIssue}
          </h2>
          <MemberIssueForm t={t} token={token} />

          {data.myIssues.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {data.myIssues.map((row) => (
                <MemberIssueCard
                  key={row.id}
                  t={t}
                  token={token}
                  line={{
                    ...row,
                    acknowledgedLabel: row.acknowledgedAt
                      ? formatTime(
                          `${String(row.acknowledgedAt.getHours()).padStart(2, '0')}:${String(
                            row.acknowledgedAt.getMinutes(),
                          ).padStart(2, '0')}`,
                          locale,
                        )
                      : null,
                  }}
                />
              ))}
            </ul>
          ) : null}
        </section>

        ) : null}

        {/* The end of his evening, in his own words. */}
        {data.stage === 'ON_DUTY' ? <DepartureButton t={t} token={token} /> : null}

        {/* Asked last, and only once the evening is actually over. */}
        {membership.eventStatus === 'COMPLETED' || membership.eventStatus === 'ARCHIVED' ? (
          <FeedbackForm t={t} token={token} answered={data.answeredFeedback} />
        ) : null}

        <p className="pb-2 text-center text-[11.5px] text-ink-600">
          {t.member.savedOffline}
        </p>
      </div>
    </MemberShell>
  );
}
