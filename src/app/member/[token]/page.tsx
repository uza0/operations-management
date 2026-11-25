import type { Metadata } from 'next';

import { getT } from '@/lib/i18n/server';
import { getMemberPortal, type MemberPortalData } from '@/server/services/member';
import { formatClock, formatDate, formatDateTime, formatTime, todayISO } from '@/lib/time';
import { format } from '@/lib/i18n';
import { ARRIVAL_WINDOW_HOURS, venueMoment } from '@/lib/journey';
import { plural } from '@/lib/plural';
import { Badge, attendanceTone, priorityTone } from '@/components/ui/status';
import { MapSourcePreview } from '@/components/map/MapSourcePreview';
import { MemberOfflineReady } from '@/components/pwa/MemberOfflineReady';

import { FeedbackForm } from './FeedbackForm';
import { PendingAttendanceSync } from './OfflineAttendanceNotice';
import {
  IconAlert,
  IconCalendar,
  IconClock,
  IconMegaphone,
  IconPin,
  IconStar,
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
import { AnnouncementImage } from '@/components/ui/AnnouncementImage';
import { PanicButton } from './PanicButton';
import { MapImagePreview } from './MapImagePreview';
import { SeatSetupCard } from './SeatSetupCard';
import { MemberIssueForm } from './MemberIssueForm';
import { MemberIssueCard } from './MemberIssueCard';
import { MemberShell, InvalidToken } from './MemberShell';

type Portal = NonNullable<MemberPortalData>;
type T = Awaited<ReturnType<typeof getT>>['t'];
type Locale = Awaited<ReturnType<typeof getT>>['locale'];

function salesRoleCopy(locale: Locale): {
  titles: Record<string, string>;
  instructions: Record<string, string[]>;
} {
  return locale === 'ar'
    ? {
        titles: {
          SALES_MANAGER: 'مسؤول المبيعات',
          SALES_ASSISTANT_MANAGER: 'مساعد مسؤول المبيعات',
          SALES_EMPLOYEE: 'موظف مبيعات',
          SALES_SUPPORT: 'إسناد المبيعات',
        },
        instructions: {
          SALES_MANAGER: [
            'نظّم فريق البيع وتوزيع التذاكر الورقية بالتنسيق مع مشرف العمليات.',
            'تابع مبالغ البيع وعدد التذاكر المسلّمة والمتبقية، وطابقها قبل نهاية العمل.',
            'حوّل أي اختلاف بالمبالغ أو مشكلة بالتذكرة إلى المشرف فوراً.',
          ],
          SALES_ASSISTANT_MANAGER: [
            'ساند مسؤول المبيعات ونظّم العمل عند زيادة الزخم.',
            'تابع تسليم التذاكر والمبالغ، وتولَّ المسؤولية عند غياب المسؤول.',
            'بلّغ مسؤول المبيعات أو المشرف عن أي نقص أو اختلاف.',
          ],
          SALES_EMPLOYEE: [
            'بع التذاكر الورقية بالسعر المعتمد فقط، وسلّم التذكرة بعد استلام المبلغ.',
            'حافظ على التذاكر والمبالغ المسلّمة لك، ولا تجرِ أي خصم أو استثناء من نفسك.',
            'أبلغ مسؤول المبيعات فوراً عند نفاد التذاكر أو ظهور مشكلة.',
          ],
          SALES_SUPPORT: [
            'أنت بروموتر مساند لفريق المبيعات عند الحاجة أو زيادة الزخم.',
            'اتبع توجيه مسؤول المبيعات، ثم ارجع لمهمتك الاعتيادية عندما ينتهي الإسناد.',
          ],
        },
      }
    : {
        titles: {
          SALES_MANAGER: 'Sales Manager',
          SALES_ASSISTANT_MANAGER: 'Assistant Sales Manager',
          SALES_EMPLOYEE: 'Sales Employee',
          SALES_SUPPORT: 'Sales Support',
        },
        instructions: {
          SALES_MANAGER: [
            'Organize the sales team and paper ticket distribution with the operations supervisor.',
            'Track sales amounts and issued/remaining tickets, then reconcile them before the shift ends.',
            'Report any cash difference or ticket issue to the supervisor immediately.',
          ],
          SALES_ASSISTANT_MANAGER: [
            'Support the Sales Manager and coordinate work during busy periods.',
            'Track ticket and cash handovers, and cover for the manager when needed.',
            'Report shortages or differences to the manager or supervisor.',
          ],
          SALES_EMPLOYEE: [
            'Sell paper tickets only at the approved price, and hand over each ticket after payment.',
            'Keep the tickets and cash assigned to you safe; do not apply discounts or exceptions.',
            'Tell the Sales Manager immediately if tickets run out or a problem comes up.',
          ],
          SALES_SUPPORT: [
            'You are a promoter assigned to support Sales when needed or during busy periods.',
            'Follow the Sales Manager’s direction, then return to your regular promoter duty.',
          ],
        },
      };
}

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

/**
 * A compact header backed by the event's poster (blurred, as the colour of
 * the night) or, without one, by the brand's cover. Used once he is there
 * and after it is over, where the full card would be in the way.
 */
function PosterBand({ poster, children }: { poster: string | null; children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-card border border-ink-700 bg-[#121317] text-white">
      {poster ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- immutable /uploads/ image */}
          <img aria-hidden src={poster} alt="" className="absolute -inset-8 h-[calc(100%+4rem)] w-[calc(100%+4rem)] max-w-none object-cover blur-2xl saturate-150" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-black/80" />
        </>
      ) : (
        <>
          <div aria-hidden className="absolute -top-20 h-44 w-44 rounded-full bg-brand-500/90 ltr:-right-14 rtl:-left-14" />
          <div aria-hidden className="absolute -top-12 h-28 w-28 rounded-full border-2 border-[#121317]/70 ltr:-right-6 rtl:-left-6" />
        </>
      )}
      <div className="relative flex items-center gap-3 p-4">
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element -- immutable /uploads/ image
          <img src={poster} alt="" className="h-[96px] w-[76px] shrink-0 rounded-xl border-2 border-white/20 object-cover shadow-xl" style={{ objectPosition: '50% 20%' }} />
        ) : null}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </section>
  );
}

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
  const today = todayISO();
  const days = Math.round((Date.parse(m.eventDate) - Date.parse(today)) / 86_400_000);
  const countdown = days < 0 ? null : days === 0 ? t.memberAuth.countToday : days === 1 ? t.memberAuth.countTomorrow : format(t.memberAuth.countDays, { n: days });
  const badges = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-brand-500 px-3 py-1 text-[12px] font-bold text-white">{t.enums.eventType[m.eventType as EventType]}</span>
      {m.isReserve ? <Badge tone="warn">{t.eventTeam.reserve}</Badge> : null}
      {countdown ? <span className="rounded-full bg-white/15 px-3 py-1 text-[12px] font-bold text-white backdrop-blur-md">{countdown}</span> : null}
    </div>
  );
  const place = (
    <p className="mt-2 flex items-start gap-2 text-[14.5px] font-semibold text-white/90">
      <IconPin width={17} height={17} className="mt-0.5 shrink-0 text-[#ff8f84]" />
      <span className="min-w-0">
        {m.venueName}
        {m.venueAddress ? <span className="mt-0.5 block text-[12.5px] font-normal text-white/60">{m.venueAddress}</span> : null}
      </span>
    </p>
  );
  return (
    <section className="overflow-hidden rounded-card border border-ink-700 bg-ink-900 shadow-panel">
      {/*
        The top of the page is the evening itself: the organiser's poster
        when there is one, otherwise the brand's own cover. Either way the
        name and the place sit on it in white, the way a ticket reads.
      */}
      {m.eventPosterUrl ? (
        <div className="relative h-[300px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- immutable /uploads/ image */}
          <img src={m.eventPosterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: '50% 22%' }} />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/50 via-50% to-[#121317]" />
          <div className="absolute inset-x-0 top-0 p-4">{badges}</div>
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <h1 className="text-[27px] font-extrabold leading-[1.15]">{m.eventName}</h1>
            {place}
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden bg-[#121317] p-5 text-white">
          <div aria-hidden className="absolute -top-24 h-56 w-56 rounded-full bg-brand-500/90 ltr:-right-20 rtl:-left-20" />
          <div aria-hidden className="absolute -top-16 h-40 w-40 rounded-full border-2 border-[#121317]/70 ltr:-right-12 rtl:-left-12" />
          <div className="relative">
            {badges}
            <h1 className="mt-4 text-[27px] font-extrabold leading-[1.15]">{m.eventName}</h1>
            {place}
          </div>
        </div>
      )}

      {/* The two numbers that decide when to leave the house. */}
      <div className="grid grid-cols-3 divide-x divide-ink-700 border-t border-ink-700 rtl:divide-x-reverse">
        {[
          [<IconCalendar key="i" width={13} height={13} />, t.member.date, formatDate(m.eventDate, locale)],
          [<IconUsers key="i" width={13} height={13} />, t.memberAuth.teamArrival, formatTime(m.eventArrival, locale)],
          [<IconClock key="i" width={13} height={13} />, t.event.kickoff, formatTime(m.eventStart, locale)],
        ].map(([icon, label, value], index) => (
          <div key={index} className={`px-3 py-3 ${index === 1 ? 'bg-brand-500/10' : ''}`}>
            <p className={`flex items-center gap-1 text-[11.5px] font-bold ${index === 1 ? 'text-brand-300' : 'text-ink-500'}`}>{icon}{label}</p>
            <p className="nums mt-1 text-[14px] font-semibold leading-5 text-ink-100">{value}</p>
          </div>
        ))}
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
  const taskInstructions = t.member.taskInstructions[assignment.task as Task] ?? [];

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
        {taskInstructions.length > 0 ? (
          <div className="mt-4 rounded-xl border border-brand-700/50 bg-ink-900/70 p-3.5">
            <p className="text-[13px] font-bold text-ink-100">{t.member.taskInstructionsTitle}</p>
            <ul className="mt-2 list-disc space-y-1.5 ps-5 text-[13px] leading-5 text-ink-200">
              {taskInstructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
            </ul>
          </div>
        ) : null}
      </div>

      {/*
       * Arrival and shift belong together: the first is a single instant and
       * the one thing a promoter is held to, the second is the span it opens.
       */}
      <div className="grid grid-cols-2 divide-x divide-brand-600/20 border-t border-brand-600/20 bg-ink-900 rtl:divide-x-reverse">
        <div className="px-4 py-3">
          <p className="text-[12.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
            {t.member.yourArrival}
          </p>
          <p className="nums mt-1 text-[24px] font-extrabold leading-tight text-ink-100">
            {formatTime(assignment.arrivalTime, locale)}
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[12.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
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

  /*
   * Who is in charge of him, first. The gate leader runs the gate; a
   * section supervisor runs one job inside it, and for the people on that
   * job he is the person to go to — so he is named as such, not left as one
   * more line in the list.
   */
  const myTask = mates.find((row) => row.id === myId)?.task ?? null;
  const leader = mates.find((row) => row.isGateLeader) ?? null;
  const supervisors = mates
    .filter((row) => row.eventRole === 'SECTION_SUPERVISOR' && row.id !== leader?.id)
    .sort((a, b) => Number(b.task === myTask) - Number(a.task === myTask));
  const heads = [
    ...(leader ? [{ row: leader, label: t.member.gateLeaderIs }] : []),
    ...supervisors.map((row) => ({
      row,
      label: row.id === myId ? t.member.youAreSectionSupervisor : row.task === myTask ? t.member.yourSectionSupervisor : t.enums.eventRole.SECTION_SUPERVISOR,
    })),
  ];
  const headIds = new Set(heads.map((head) => head.row.id));
  const others = mates.filter((row) => !headIds.has(row.id));

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 px-1 text-[15px] font-bold text-ink-100">
        <IconUsers width={17} height={17} className="text-ink-500" />
        {data.assignment?.gateId ? t.member.atYourGate : t.member.atYourPoint}
      </h2>
      <ul className="panel divide-y divide-ink-700">
        {heads.map(({ row, label }) => (
          <li key={row.id} className="flex items-center justify-between gap-3 bg-brand-500/5 px-4 py-3">
            <span className="min-w-0">
              <span className="block truncate text-[14.5px] font-bold text-ink-100" style={{ unicodeBidi: 'plaintext' }}>
                {row.name}
                {row.id === myId ? ` (${t.member.you})` : ''}
              </span>
              <span className="mt-0.5 block text-[12.5px] text-ink-400">{t.enums.task[row.task as Task]}</span>
            </span>
            <Badge tone="brand">{label}</Badge>
          </li>
        ))}

        {others.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="min-w-0">
              <span className="block truncate text-[14.5px] font-semibold text-ink-100" style={{ unicodeBidi: 'plaintext' }}>
                {row.name}
                {row.id === myId ? ` (${t.member.you})` : ''}
              </span>
              <span className="mt-0.5 block text-[12.5px] text-ink-400">{t.enums.task[row.task as Task]}</span>
            </span>
          </li>
        ))}
      </ul>
      {heads.length === 0 ? (
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
    if (data.membership.eventStatus === 'CANCELLED') {
      return <InvalidToken title={t.enums.eventStatus.CANCELLED} hint={t.event.cancelledNotice} />;
    }
    return <InvalidToken title={t.member.cancelled} hint={t.member.invalidTokenHint} />;
  }
  if (data.expired) {
    return <InvalidToken title={t.member.expiredToken} hint={t.member.invalidTokenHint} />;
  }

  const { membership, assignment } = data;
  const arrivalAvailableAt =
    venueMoment(membership.eventDate, membership.eventArrival).getTime() -
    ARRIVAL_WINDOW_HOURS * 3_600_000;
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
    membership.salesRole && membership.salesRole in salesRoleCopy(locale).titles
      ? salesRoleCopy(locale).titles[membership.salesRole]
      : membership.eventRole && membership.eventRole in t.enums.eventRole
      ? t.enums.eventRole[membership.eventRole as EventRole]
      : assignment?.isGateLeader
        ? t.gate.gateLeader
        : t.team.promoter;

  const salesBriefing = membership.salesRole
    ? salesRoleCopy(locale).instructions[membership.salesRole] ?? null
    : null;

  /* One of three, decided by the stage and by nothing on the screen. */
  const phase =
    data.stage === 'CLOSED'
      ? 'CLOSED'
      : data.stage === 'AFTER'
        ? 'AFTER'
        : data.stage === 'ON_DUTY'
          ? 'DURING'
          : 'BEFORE';

  /*
   * The ordinary announcements, as one list used wherever they belong. An
   * announcement is written to be read: one sent the afternoon before used
   * to reach him only as a notification, and tapping it opened a page with
   * no trace of it until the evening began.
   */
  const announcementList = (rows: typeof rest) => (
    <section>
      <h2 className="mb-2 flex items-center gap-2 px-1 text-[15px] font-bold text-ink-100">
        <IconMegaphone width={17} height={17} className="text-ink-500" />
        {t.member.announcements}
      </h2>
      <ul className="space-y-2">
        {rows.map((row) => (
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
            <AnnouncementImage url={row.imageUrl} alt={row.title} />
          </li>
        ))}
      </ul>
    </section>
  );

  const identity = (
    /* His badge for the night: the face a supervisor checks at the gate. */
    <section className="relative flex items-center gap-3 overflow-hidden rounded-card border border-ink-700 bg-ink-850 px-4 py-3.5">
      <span aria-hidden className="absolute inset-y-0 w-1.5 bg-brand-500 ltr:left-0 rtl:right-0" />
      <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-600 text-[18px] font-extrabold text-white ring-2 ring-brand-500 ring-offset-2 ring-offset-ink-850">
        {membership.memberPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- immutable /uploads/ image
          <img src={membership.memberPhotoUrl} alt="" className="h-full w-full object-cover" />
        ) : membership.memberName.trim().charAt(0)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16.5px] font-bold text-ink-100" style={{ unicodeBidi: 'plaintext' }}>{membership.memberName}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-brand-500/15 px-2.5 py-0.5 text-[12px] font-semibold text-brand-300">{positionLabel}</span>
          <span className="nums rounded-full border border-ink-600 px-2.5 py-0.5 text-[12px] font-semibold text-ink-300" dir="ltr">{membership.memberCode}</span>
        </div>
      </div>
      <span className="hidden text-[10px] font-bold tracking-[0.2em] text-ink-500 min-[380px]:block" dir="ltr">CREW</span>
    </section>
  );

  return (
    <MemberShell back="/me">
      <div className="stagger space-y-4">
        <MemberOfflineReady t={t} />
        <PendingAttendanceSync t={t} token={token} />
        {/* The map is for finding a gate; once the evening is over there is none to find. */}
        {phase === 'AFTER' || phase === 'CLOSED' ? null : data.mapSource?.kind === 'image' ? (
          <MapImagePreview title={t.map.mapPreviewTitle} url={data.mapSource.url} />
        ) : data.mapSource ? (
          <MapSourcePreview
            title={t.map.mapPreviewTitle}
            fileUrl={data.mapSource.kind === 'pdf' ? data.mapSource.url : null}
            linkUrl={data.mapSource.kind === 'link' ? data.mapSource.url : null}
            openLinkLabel={t.map.openMapLink}
            downloadLabel={t.map.downloadMapPdf}
            fallback={t.map.mapEmbedFallback}
          />
        ) : null}
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

            {data.stage === 'ARRIVING' || data.stage === 'CONFIRMED' ? (
              <ArrivalButton
                t={t}
                token={token}
                availableAt={data.stage === 'CONFIRMED' ? arrivalAvailableAt : undefined}
              />
            ) : null}

            {data.stage === 'AWAITING_APPROVAL' ? (
              <>
                <section className="rise rounded-card border border-warn/40 bg-warn/10 p-4 text-center">
                  <p className="text-[14.5px] font-semibold text-ink-100">
                    {format(t.journey.arrivalWaiting, {
                      time: formatTime(data.attendance?.checkInTime ?? '', locale),
                    })}
                  </p>
                </section>
                <DepartureButton t={t} token={token} offlineOnly />
              </>
            ) : null}

            {identity}

            {salesBriefing ? (
              <section className="rounded-card border border-brand-700/60 bg-brand-950/30 p-4">
                <p className="text-[14px] font-bold text-ink-100">
                  {locale === 'ar' ? 'تعليمات مهمتك بالمبيعات' : 'Your Sales Team briefing'}
                </p>
                <ul className="mt-2 list-disc space-y-1 ps-5 text-[13.5px] leading-6 text-ink-200">
                  {salesBriefing.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </section>
            ) : null}

            {/*
              Urgent announcements first and loud, because they change what he
              does now — "come at four, not five". The rest follow as a plain
              list: whatever was sent to him has to be on the page the
              notification opens, not only in the notification.
            */}
            {urgent.length > 0 ? (
              <section className="space-y-2" aria-label={t.member.announcements}>
                {urgent.map((row) => (
                  <div
                    key={row.id}
                    /*
                      Amber, not red. Red on this page belongs to the call for
                      help; an urgent notice in the same red directly under it
                      made two alarms of one, and the eye learned to skip both.
                    */
                    className="rounded-card border border-warn/60 bg-warn/12 p-4"
                    role="alert"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <IconAlert width={17} height={17} className="text-warn-text" />
                      <span className="text-[12px] font-bold uppercase tracking-wide text-warn-text">
                        {t.enums.priority.URGENT}
                      </span>
                    </div>
                    <p className="text-[15px] font-semibold text-ink-100">{row.title}</p>
                    <p className="mt-1 whitespace-pre-line text-[14px] leading-6 text-ink-200">
                      {row.message}
                    </p>
                    <AnnouncementImage url={row.imageUrl} alt={row.title} />
                  </div>
                ))}
              </section>
            ) : null}

            {rest.length > 0 ? announcementList(rest) : null}

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
                      setupStatus={shift.status}
                      stage={shift.stage}
                      arrivalWindowStartsAt={
                        venueMoment(shift.date, shift.startTime).getTime() -
                        ARRIVAL_WINDOW_HOURS * 3_600_000
                      }
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
            <PosterBand poster={membership.eventPosterUrl}>
              <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-2.5 py-0.5 text-[11.5px] font-bold text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                {t.member.duringTitle}
              </p>
              <p className="mt-1.5 line-clamp-2 text-[18px] font-bold leading-6">{membership.eventName}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] font-semibold">
                {locationName ? <span className="rounded-full bg-white/15 px-2.5 py-0.5 backdrop-blur-md">{locationName}</span> : null}
                {assignment ? <span className="rounded-full bg-white/15 px-2.5 py-0.5 backdrop-blur-md">{t.enums.task[assignment.task as Task]}</span> : null}
                {data.attendance ? (
                  <Badge tone={attendanceTone[data.attendance.status as AttendanceStatus]}>
                    {t.enums.attendanceStatus[data.attendance.status as AttendanceStatus]}
                    {data.attendance.checkInTime ? ` · ${formatTime(data.attendance.checkInTime, locale)}` : ''}
                  </Badge>
                ) : null}
              </div>
            </PosterBand>

            {/* The call for help, first, and deliberately hard to miss. */}
            <PanicButton t={t} token={token} />

            {/* Anything that changed while he was on his feet. */}
            {urgent.length > 0 ? (
              <section className="space-y-2" aria-label={t.member.announcements}>
                {urgent.map((row) => (
                  <div
                    key={row.id}
                    /*
                      Amber, not red. Red on this page belongs to the call for
                      help; an urgent notice in the same red directly under it
                      made two alarms of one, and the eye learned to skip both.
                    */
                    className="rounded-card border border-warn/60 bg-warn/12 p-4"
                    role="alert"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <IconAlert width={17} height={17} className="text-warn-text" />
                      <span className="text-[12px] font-bold uppercase tracking-wide text-warn-text">
                        {t.enums.priority.URGENT}
                      </span>
                    </div>
                    <p className="text-[15px] font-semibold text-ink-100">{row.title}</p>
                    <p className="mt-1 whitespace-pre-line text-[14px] leading-6 text-ink-200">
                      {row.message}
                    </p>
                    <AnnouncementImage url={row.imageUrl} alt={row.title} />
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
                          ? formatClock(row.acknowledgedAt, locale)
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
                      <AnnouncementImage url={row.imageUrl} alt={row.title} />
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
            {/* Over: the night as a keepsake, and the way to share it. */}
            <PosterBand poster={membership.eventPosterUrl}>
              <p className="inline-flex rounded-full bg-white/15 px-2.5 py-0.5 text-[11.5px] font-bold backdrop-blur-md">{t.journey.thanksTitle}</p>
              <p className="mt-1.5 line-clamp-2 text-[18px] font-bold leading-6">{membership.eventName}</p>
              <p className="mt-1 text-[12px] text-white/75">{formatDate(membership.eventDate, locale)} · {membership.venueName}</p>
              {data.attendance?.checkInTime ? (
                <p className="nums mt-2 inline-flex flex-wrap gap-1.5 text-[11.5px] font-semibold">
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5">{t.memberAuth.arrivedAt} {formatTime(data.attendance.checkInTime, locale)}</span>
                  {data.attendance.checkOutTime ? <span className="rounded-full bg-white/15 px-2.5 py-0.5">{t.memberAuth.leftAt} {formatTime(data.attendance.checkOutTime, locale)}</span> : null}
                </p>
              ) : null}
            </PosterBand>
            <p className="-mt-1 px-1 text-center text-[12.5px] leading-6 text-ink-400">{t.journey.thanksHint}</p>
            <a href="/me/card" className="btn-primary btn-sm flex w-full items-center justify-center gap-2"><IconStar width={15} height={15} />{t.memberAuth.shareWasThere}</a>

            {membership.eventStatus === 'COMPLETED' ||
            membership.eventStatus === 'ARCHIVED' ? (
              <FeedbackForm t={t} token={token} answered={data.answeredFeedback} />
            ) : null}

            {urgent.length + rest.length > 0 ? announcementList([...urgent, ...rest]) : null}

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
                          ? formatClock(row.acknowledgedAt, locale)
                          : null,
                      }}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}

        <p className="pb-2 text-center text-[12.5px] text-ink-600">
          {t.member.savedOffline}
        </p>
      </div>
    </MemberShell>
  );
}
