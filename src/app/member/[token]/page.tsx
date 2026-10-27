import type { Metadata } from 'next';

import { getT } from '@/lib/i18n/server';
import { getMemberPortal, type MemberPortalData } from '@/server/services/member';
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
  Priority,
  Task,
  TimelineStatus,
} from '@/lib/constants';

import { InvitationScreen } from './InvitationScreen';
import { ArrivalButton, DepartureButton } from './ArrivalActions';
import { PanicButton } from './PanicButton';
import { SeatSetupCard } from './SeatSetupCard';
import { MemberIssueForm } from './MemberIssueForm';
import { MemberIssueCard } from './MemberIssueCard';
import { MemberShell, InvalidToken } from './MemberShell';

type Portal = NonNullable<MemberPortalData>;
type T = Awaited<ReturnType<typeof getT>>['t'];
type Locale = Awaited<ReturnType<typeof getT>>['locale'];

/** "يومين و٤ ساعات" — a span a person reads, not a number of minutes. */
function formatSpan(ms: number, t: T): string {
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

/* -------------------------------------------------------------------------- */
/* Pieces shared by more than one screen                                       */
/* -------------------------------------------------------------------------- */

/** What, where, when — and the one link that gets him there. */
function EventCard({
  t,
  locale,
  m,
}: {
  t: T;
  locale: Locale;
  m: Portal['membership'];
}) {
  return (
    <section className="rounded-card border border-ink-700 bg-ink-900 shadow-panel">
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{t.enums.eventType[m.eventType as EventType]}</Badge>
          {m.isReserve ? <Badge tone="warn">{t.eventTeam.reserve}</Badge> : null}
        </div>

        <h1 className="mt-2.5 text-[27px] font-extrabold leading-[1.15] text-ink-100">
          {m.eventName}
        </h1>

        <p className="mt-2 flex items-start gap-2 text-[15px] font-semibold text-ink-200">
          <IconPin width={17} height={17} className="mt-0.5 shrink-0 text-brand-600" />
          <span className="min-w-0">
            {m.venueName}
            {m.venueAddress ? (
              <span className="mt-0.5 block text-[12.5px] font-normal text-ink-500">
                {m.venueAddress}
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
            {formatDate(m.eventDate, locale)}
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
            <IconClock width={13} height={13} />
            {t.event.kickoff}
          </p>
          <p className="nums mt-1 text-[14px] font-semibold text-ink-100">
            {formatTime(m.eventStart, locale)}
          </p>
        </div>
      </div>

      {m.venueLocationUrl ? (
        <div className="border-t border-ink-700 p-3">
          <a
            href={m.venueLocationUrl}
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
  );
}

/** His place and his task, in the type size they deserve. */
function PostCard({
  t,
  locale,
  locationName,
  assignment,
}: {
  t: T;
  locale: Locale;
  locationName: string | null;
  assignment: NonNullable<Portal['assignment']>;
}) {
  return (
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
          <p className="mt-2 text-[13.5px] leading-6 text-ink-300">{assignment.notes}</p>
        ) : null}
      </div>

      {/*
       * Arrival and shift belong together: the first is a single instant and
       * the one thing a promoter is held to, the second is the span it opens.
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
  );
}

/**
 * Who else is at this post, and who is in charge of it.
 *
 * Names and tasks, nothing more. The leader is marked where there is one and
 * simply absent where there is not — a row saying "gate leader: not set" tells
 * a man at a barrier nothing he can act on, so instead he is told plainly to
 * go to the team leader.
 */
function MatesCard({
  t,
  data,
  myId,
}: {
  t: T;
  data: Portal;
  myId: string;
}) {
  const mates = data.mates;
  if (mates.length === 0) return null;

  const leader = mates.find((row) => row.isGateLeader) ?? null;
  const others = mates.filter((row) => row.id !== leader?.id);

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 px-1 text-[15px] font-bold text-ink-100">
        <IconUsers width={17} height={17} className="text-ink-500" />
        {data.assignment?.gateId ? t.member.atYourGate : t.member.atYourPoint}
      </h2>
      <ul className="panel divide-y divide-ink-700">
        {leader ? (
          <li className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="min-w-0">
              <span
                className="block truncate text-[14.5px] font-bold text-ink-100"
                style={{ unicodeBidi: 'plaintext' }}
              >
                {leader.name}
                {leader.id === myId ? ` (${t.member.you})` : ''}
              </span>
              <span className="mt-0.5 block text-[12.5px] text-ink-400">
                {t.enums.task[leader.task as Task]}
              </span>
            </span>
            <Badge tone="brand">{t.member.gateLeaderIs}</Badge>
          </li>
        ) : null}

        {others.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="min-w-0">
              <span
                className="block truncate text-[14.5px] font-semibold text-ink-100"
                style={{ unicodeBidi: 'plaintext' }}
              >
                {row.name}
                {row.id === myId ? ` (${t.member.you})` : ''}
              </span>
              <span className="mt-0.5 block text-[12.5px] text-ink-400">
                {t.enums.task[row.task as Task]}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {!leader ? (
        <p className="mt-1.5 px-1 text-[12.5px] leading-5 text-ink-400">
          {t.member.noGateLeaderHere}
        </p>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* The page                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The member portal (spec §4 / §19 / §37).
 *
 * Three screens on one link, and only ever one of them at a time.
 *
 *   • BEFORE  — the invitation, the details, where he will stand and who he
 *               will stand with. It ends when his arrival is approved.
 *   • DURING  — the evening itself: the running order, the announcements, the
 *               emergency call and the problems he reports. Nothing from the
 *               screen before it, because none of it is a question any more.
 *   • AFTER   — the leader marks the event finished, and the only thing left
 *               is his opinion.
 *
 * They replace each other rather than stacking. The old page showed all of it
 * at once and let each section decide whether to render, which meant a man
 * looking for one thing scrolled past nine others — and the thing he was
 * looking for was usually the one at the bottom.
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

  /*
   * What this person is, in one phrase. Everyone in the field is a promoter;
   * a specific role replaces that title rather than sitting beside it.
   */
  const positionLabel =
    membership.eventRole && membership.eventRole in t.enums.eventRole
      ? t.enums.eventRole[membership.eventRole as EventRole]
      : assignment?.isGateLeader
        ? t.gate.gateLeader
        : t.team.promoter;

  /* One of three, decided by the stage and by nothing on the screen. */
  const phase =
    data.stage === 'CLOSED'
      ? 'CLOSED'
      : data.stage === 'AFTER'
        ? 'AFTER'
        : data.stage === 'ON_DUTY'
          ? 'DURING'
          : 'BEFORE';

  const identity = (
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
          <span aria-hidden className="text-ink-600">
            ·
          </span>
          <span className="nums">{membership.memberCode}</span>
        </p>
      </div>
    </section>
  );

  return (
    <MemberShell>
      <div className="stagger space-y-4">
        {/* ---------------------------------------------------------------- */}
        {/* CLOSED — he declined, or his place went to somebody else.         */}
        {/* ---------------------------------------------------------------- */}
        {phase === 'CLOSED' ? (
          <>
            <EventCard t={t} locale={locale} m={membership} />
            <section className="rounded-card border border-ink-700 bg-ink-850 p-5 text-center">
              <p className="text-[16px] font-bold text-ink-100">{t.journey.closedTitle}</p>
              <p className="mt-1.5 text-[13px] leading-6 text-ink-400">
                {t.journey.closedHint}
              </p>
            </section>
          </>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* BEFORE — the invitation, and everything he needs to turn up.      */}
        {/* ---------------------------------------------------------------- */}
        {phase === 'BEFORE' ? (
          <>
            <EventCard t={t} locale={locale} m={membership} />

            {/*
              The question of the moment, and never two of them. Before he has
              answered there is nothing to ask but the invitation; once the
              hour comes there is nothing to ask but whether he is here.
            */}
            {data.stage === 'INVITED' ? (
              <InvitationScreen
                t={t}
                token={token}
                pay={data.invitation.payAmount}
                currency={t.credit.currency}
                deadline={deadline}
                urgent={
                  data.invitation.respondBy === null && data.invitation.confirmedAt === null
                }
                overdue={overdue}
              />
            ) : null}

            {data.stage === 'ARRIVING' ? <ArrivalButton t={t} token={token} /> : null}

            {data.stage === 'AWAITING_APPROVAL' ? (
              <section className="rise rounded-card border border-warn/40 bg-warn/10 p-4 text-center">
                <p className="text-[14.5px] font-semibold text-ink-100">
                  {format(t.journey.arrivalWaiting, {
                    time: formatTime(data.attendance?.checkInTime ?? '', locale),
                  })}
                </p>
              </section>
            ) : null}

            {identity}

            {/*
              Urgent announcements reach him here too, and only urgent ones.
              The ordinary instructions are about the evening and wait for it;
              an urgent one is by definition something that changes what he
              does now — "come at four, not five" is useless on a screen he
              only reaches after he has arrived.
            */}
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

            {/* Anything that changed since he last looked. */}
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

            {/* The earlier shift, when there is one. */}
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

            {/* The days before, for whoever sets out the chairs. */}
            {data.seatSetup.length > 0 ? (
              <section className="rounded-card border border-ink-700 bg-ink-850 p-4">
                <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-400">
                  {t.seatSetup.memberTitle}
                </p>
                {/*
                  One card per day, each with its own question on it. A big hall
                  is built over two or three afternoons, a man can be free for
                  one of them and not the next, and the fee is per day.
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

            {/* Where he stands and what he does. */}
            {assignment ? (
              <section>
                <h2 className="mb-2 flex items-center gap-2 px-1 text-[15px] font-bold text-ink-100">
                  <IconTarget width={17} height={17} className="text-brand-600" />
                  {t.member.onDuty}
                </h2>
                <PostCard
                  t={t}
                  locale={locale}
                  locationName={locationName}
                  assignment={assignment}
                />
              </section>
            ) : (
              /*
               * Two different silences, and telling them apart is the whole
               * point. "The board is still being arranged" says the wait is
               * normal and nothing is required of him; "you have no place yet"
               * says the board is finished and he is not on it, which is worth
               * a phone call. One message for both left everyone calling, or
               * nobody.
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

            {/* Who is at this post with him, and who runs it. */}
            <MatesCard t={t} data={data} myId={membership.id} />

            <section>
              <h2 className="mb-2 flex items-center gap-2 px-1 text-[15px] font-bold text-ink-100">
                <IconUsers width={17} height={17} className="text-ink-500" />
                {t.member.reportTo}
              </h2>
              <div className="panel divide-y divide-ink-700">
                <Fact
                  icon={<IconTarget width={16} height={16} className="text-ink-500" />}
                  label={t.member.yourTeamLeader}
                >
                  {data.teamLeaderName ?? (
                    <span className="font-normal text-ink-500">{t.member.noLeaderYet}</span>
                  )}
                </Fact>
              </div>
            </section>
          </>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* DURING — the evening. Nothing on this screen is a question about  */}
        {/* whether he is coming; all of it is about the next hour.           */}
        {/* ---------------------------------------------------------------- */}
        {phase === 'DURING' ? (
          <>
            {/*
              A thin header, not the full card: by now he is standing at the
              place, and what he needs at a glance is which post he is on and
              that his attendance is recorded.
            */}
            <section className="rounded-card border border-ink-700 bg-ink-900 px-4 py-3.5">
              <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-500">
                {t.member.duringTitle}
              </p>
              <p className="mt-1 truncate text-[17px] font-bold text-ink-100">
                {membership.eventName}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {locationName ? <Badge tone="brand">{locationName}</Badge> : null}
                {assignment ? (
                  <Badge tone="neutral">{t.enums.task[assignment.task as Task]}</Badge>
                ) : null}
                {data.attendance ? (
                  <Badge tone={attendanceTone[data.attendance.status as AttendanceStatus]}>
                    {t.enums.attendanceStatus[data.attendance.status as AttendanceStatus]}
                    {data.attendance.checkInTime
                      ? ` · ${formatTime(data.attendance.checkInTime, locale)}`
                      : ''}
                  </Badge>
                ) : null}
              </div>
            </section>

            {/* The call for help, first, and deliberately hard to miss. */}
            <PanicButton t={t} token={token} />

            {/* Anything that changed while he was on his feet. */}
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

            {/* Reporting a problem, and watching what happened to it. */}
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
                              `${String(row.acknowledgedAt.getHours()).padStart(
                                2,
                                '0',
                              )}:${String(row.acknowledgedAt.getMinutes()).padStart(2, '0')}`,
                              locale,
                            )
                          : null,
                      }}
                    />
                  ))}
                </ul>
              ) : null}
            </section>

            {/* Who is here with him — useful at eight o'clock, not just at six. */}
            <MatesCard t={t} data={data} myId={membership.id} />

            {/* The instructions. */}
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
                        <p className="text-[14.5px] font-semibold text-ink-100">
                          {row.title}
                        </p>
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

            {/* The evening's running order. */}
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

            {/* The end of his evening, in his own words. */}
            <DepartureButton t={t} token={token} />
          </>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* AFTER — the leader marked it finished. One thing left.            */}
        {/* ---------------------------------------------------------------- */}
        {phase === 'AFTER' ? (
          <>
            <section className="rounded-card border border-ink-700 bg-ink-850 p-4 text-center">
              <p className="text-[15px] font-bold text-ink-100">{t.journey.thanksTitle}</p>
              <p className="mt-1 text-[12.5px] leading-6 text-ink-400">
                {t.journey.thanksHint}
              </p>
            </section>

            {membership.eventStatus === 'COMPLETED' ||
            membership.eventStatus === 'ARCHIVED' ? (
              <FeedbackForm t={t} token={token} answered={data.answeredFeedback} />
            ) : null}

            {/*
              His own reports stay readable for as long as the link lives: a
              man who spent the night chasing a broken scanner can see what
              became of it, and that is the whole reason to report the next one.
            */}
            {data.myIssues.length > 0 ? (
              <section>
                <h2 className="mb-2 flex items-center gap-2 px-1 text-[15px] font-bold text-ink-100">
                  <IconAlert width={17} height={17} className="text-ink-500" />
                  {t.member.reportIssue}
                </h2>
                <ul className="space-y-2">
                  {data.myIssues.map((row) => (
                    <MemberIssueCard
                      key={row.id}
                      t={t}
                      token={token}
                      line={{
                        ...row,
                        acknowledgedLabel: row.acknowledgedAt
                          ? formatTime(
                              `${String(row.acknowledgedAt.getHours()).padStart(
                                2,
                                '0',
                              )}:${String(row.acknowledgedAt.getMinutes()).padStart(2, '0')}`,
                              locale,
                            )
                          : null,
                      }}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}

        <p className="pb-2 text-center text-[11.5px] text-ink-600">
          {t.member.savedOffline}
        </p>
      </div>
    </MemberShell>
  );
}
