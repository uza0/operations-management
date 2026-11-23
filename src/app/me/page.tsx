import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { format } from '@/lib/i18n';
import { getT } from '@/lib/i18n/server';
import { formatDate, formatTime, todayISO } from '@/lib/time';
import { IconCalendar, IconChevron, IconClock, IconPin, IconClipboard } from '@/components/ui/icons';
import { currentMember, touchMemberSession } from '@/server/services/member-auth';
import { currentUser, homeFor } from '@/server/auth/rbac';
import { getMemberHome } from '@/server/services/member-home';
import { getMemberAttendanceScore } from '@/server/services/member';
import { sweepInBackground } from '@/server/services/sweep';
import { surveysFor } from '@/server/services/surveys';

import { MemberShell } from '../member/[token]/MemberShell';
import { AttendanceScoreCard } from './AttendanceScoreCard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'TicketZone Ops' };

/**
 * The promoter's own page: who he is, and his events.
 *
 * There is no token in this address, and that is the point of it. He signed in
 * once with his phone and four digits, the session remembers the device, and
 * the icon he adds to his home screen points at the site rather than at one
 * event — so it still works next season, and rotating his code does not break
 * the app he installed.
 *
 * The three event screens he already knows are untouched: each card opens the
 * same /member/<token> page it always did.
 */
export default async function MemberHomePage() {
  /*
   * Only the promoter session decides this page.
   *
   * Some people are both: a supervisor who also works a gate, and the person
   * who wrote this system. Their two sessions live in two different cookies
   * on purpose, and this page belongs to one of them — so being signed in as
   * staff in the same browser must not take it away. Without this, the only
   * way to see your own promoter page was to sign out of the office.
   */
  const session = await currentMember();
  if (!session) redirect('/login?as=member');

  /*
   * While somebody is here, see whether anybody is due at a gate within the
   * hour. Not awaited and never fatal — this page is his, not the sweep's.
   */
  sweepInBackground();

  const [{ locale, t }, home, staff, attendanceScore, openSurveys] = await Promise.all([
    getT(),
    getMemberHome(session.teamMemberId),
    currentUser(),
    getMemberAttendanceScore(session.teamMemberId),
    surveysFor(session.teamMemberId).catch(() => []),
  ]);

  if (!home) redirect('/login');
  await touchMemberSession(session.sessionId);

  const nextEvent = home.live[0] ?? home.upcoming[0] ?? null;
  const activeSeat = home.seatInvitations.find((row) =>
    ['ARRIVING', 'AWAITING_APPROVAL', 'ON_DUTY'].includes(row.stage),
  );
  const unansweredSeat = home.seatInvitations.find((row) => row.stage === 'INVITED');
  const confirmedSeat = home.seatInvitations.find((row) => row.stage === 'CONFIRMED');
  const nextSeat =
    activeSeat ??
    unansweredSeat ??
    (!home.live.length &&
    confirmedSeat &&
    (!home.upcoming[0] || confirmedSeat.date <= home.upcoming[0].date)
      ? confirmedSeat
      : undefined);

  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', hour: '2-digit', hour12: false }).format(new Date()));
  const greeting = hour >= 5 && hour < 12 ? t.memberAuth.greetMorning : t.memberAuth.greetEvening;
  const nextDate = nextSeat?.date ?? nextEvent?.date ?? null;
  const daysLeft = nextDate ? Math.round((Date.parse(nextDate) - Date.parse(todayISO())) / 86_400_000) : null;
  const countdown = daysLeft === null ? null : home.live.length > 0 && !nextSeat ? t.memberAuth.countNow : daysLeft <= 0 ? t.memberAuth.countToday : daysLeft === 1 ? t.memberAuth.countTomorrow : format(t.memberAuth.countDays, { n: daysLeft });
  const poster = !nextSeat && nextEvent?.posterUrl ? nextEvent.posterUrl : null;
  const [dDay, dMonth] = nextDate ? [Number(nextDate.slice(8, 10)), new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ar-IQ', { month: 'long', timeZone: 'UTC' }).format(new Date(nextDate + 'T00:00:00Z'))] : [0, ''];

  const surveyCard = (survey: (typeof openSurveys)[number]) => (
        <section
          key={survey.id}
          className={`rounded-card border p-4 ${survey.openedAt ? 'border-ink-700 bg-ink-850' : 'border-info/50 bg-info/10'}`}
        >
          <p className="flex items-center gap-2 text-[12.5px] font-semibold text-info-text"><span className="grid h-7 w-7 place-items-center rounded-lg bg-info/15"><IconClipboard width={15} height={15} /></span>{t.surveys.cardTitle}</p>
          <h2 className="mt-1 text-[15.5px] font-bold leading-6 text-ink-100">{survey.title}</h2>
          {survey.note ? (
            <p className="mt-1 whitespace-pre-line text-[13px] leading-5 text-ink-300">{survey.note}</p>
          ) : null}
          <div className="mt-3 flex items-center justify-between gap-3">
            {survey.openedAt ? (
              <span className="text-[12.5px] text-ok-text">✓ {t.surveys.cardDone}</span>
            ) : (
              <span />
            )}
            <a href={`/me/survey/${survey.id}`} className={survey.openedAt ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'}>
              {t.surveys.cardOpen}
            </a>
          </div>
        </section>
  );

  const empty =
    home.live.length === 0 &&
    home.upcoming.length === 0 &&
    home.past.length === 0 &&
    home.seatInvitations.length === 0;

  return (
    <MemberShell>
      {/* Who he is, on the brand's own colours: the same cover his profile wears. */}
      <section className="relative overflow-hidden rounded-card border border-ink-700 bg-[#121317] p-4 text-white">
        <div aria-hidden className="absolute -top-20 h-48 w-48 rounded-full bg-brand-500 ltr:-right-16 rtl:-left-16" />
        <div aria-hidden className="absolute -top-12 h-32 w-32 rounded-full border-2 border-[#121317]/70 ltr:-right-8 rtl:-left-8" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border-[3px] border-[#121317] bg-ink-800 text-xl font-bold text-brand-300 ring-2 ring-brand-500">
            {home.person.photoUrl ? <img src={home.person.photoUrl} alt="" width={64} height={64} loading="lazy" className="h-16 w-16 object-cover" /> : home.person.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('')}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-white/70">{greeting}</p>
            <p className="mt-0.5 truncate text-[20px] font-bold leading-7" style={{ unicodeBidi: 'plaintext' }}>{home.person.name}</p>
            {home.person.cardNumber ? (
              <p className="nums mt-1 inline-flex rounded-full bg-white/10 px-2.5 py-0.5 text-[11.5px] text-white/80">
                {t.team.cardNumber}: <span dir="ltr" className="ms-1 font-semibold text-white">{home.person.cardNumber}</span>
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* Unopened questionnaires lead; once opened they step down below his next evening. */}
      {openSurveys.filter((x) => !x.openedAt).map(surveyCard)}
      {nextSeat || nextEvent ? (
        poster ? (
          /* With a poster: the evening as the organiser announced it. */
          <Link href={`/member/${nextEvent!.token}`} className="relative block h-[320px] overflow-hidden rounded-card shadow-lg transition hover:brightness-110">
            <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: '50% 22%' }} />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/60 via-55% to-black/95" />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
              <span className="rounded-full bg-black/55 px-3 py-1 text-[12px] font-semibold text-white backdrop-blur-md">{t.memberAuth.nextStep}</span>
              {countdown ? <span className={`rounded-full px-3 py-1 text-[12px] font-bold text-white ${home.live.length ? 'animate-pulse bg-brand-500' : 'bg-brand-500'}`}>{countdown}</span> : null}
            </div>
            <div className="absolute inset-x-0 bottom-0 p-4 text-white">
              <h2 className="line-clamp-2 text-[22px] font-bold leading-7">{nextEvent!.name}</h2>
              <p className="mt-1 text-[12.5px] text-white/75">{home.live.length > 0 ? t.memberAuth.nextStepLive : t.memberAuth.nextStepUpcoming}</p>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-white/90">
                <span className="flex items-center gap-1"><IconCalendar width={14} />{formatDate(nextEvent!.date, locale)}</span>
                <span className="flex items-center gap-1"><IconClock width={14} />{formatTime(nextEvent!.teamArrivalTime, locale)}</span>
                <span className="flex min-w-0 items-center gap-1"><IconPin width={14} className="shrink-0" /><span className="truncate">{nextEvent!.venue}</span></span>
              </div>
              <span className="btn-primary btn-sm mt-3 inline-flex w-full items-center justify-center">{t.memberAuth.nextStepOpen}</span>
            </div>
          </Link>
        ) : (
        <section className="overflow-hidden rounded-card border border-brand-600/45 bg-ink-850">
          <div className="flex items-center justify-between gap-2 bg-brand-500/10 px-4 py-2.5">
            <p className="text-[12.5px] font-bold text-brand-300">{t.memberAuth.nextStep}</p>
            {countdown ? <span className={`rounded-full bg-brand-500 px-2.5 py-0.5 text-[11.5px] font-bold text-white ${home.live.length && !nextSeat ? 'animate-pulse' : ''}`}>{countdown}</span> : null}
          </div>
          <div className="flex gap-3 p-4">
            {/* The date as a block, the way a ticket prints it. */}
            <div className="flex w-[64px] shrink-0 flex-col items-center justify-center rounded-2xl bg-brand-500 py-2 text-white">
              <span className="nums text-[26px] font-bold leading-7">{dDay}</span>
              <span className="text-[11px] font-semibold">{dMonth}</span>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="line-clamp-2 text-[16px] font-bold leading-6 text-ink-100">{nextSeat?.eventName ?? nextEvent?.name}</h2>
              <p className="mt-0.5 text-[12.5px] leading-5 text-ink-400">
                {nextSeat
                  ? nextSeat.stage === 'INVITED' ? t.memberAuth.nextStepSeatInvite : t.memberAuth.nextStepSeatProgress
                  : home.live.length > 0
                    ? t.memberAuth.nextStepLive
                    : t.memberAuth.nextStepUpcoming}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-ink-300">
                <span className="flex items-center gap-1"><IconClock width={13} />{formatTime(nextSeat?.startTime ?? nextEvent!.teamArrivalTime, locale)}</span>
                {!nextSeat && nextEvent ? <span className="flex min-w-0 items-center gap-1"><IconPin width={13} className="shrink-0" /><span className="truncate">{nextEvent.venue}</span></span> : null}
              </div>
            </div>
          </div>
          <div className="px-4 pb-4">
            <Link href={nextSeat ? `/setup/${nextSeat.token}` : `/member/${nextEvent!.token}`} className="btn-primary btn-sm flex w-full items-center justify-center">
              {t.memberAuth.nextStepOpen}
            </Link>
          </div>
        </section>
        )
      ) : null}

      {openSurveys.filter((x) => x.openedAt).map(surveyCard)}
      <AttendanceScoreCard score={attendanceScore} t={t} compact />
      <Link href="/me/events" className="flex items-center justify-between rounded-card border border-ink-700 bg-ink-850 px-4 py-3.5 transition-colors hover:bg-ink-800">
        <span className="flex items-center gap-3 text-[14px] font-semibold text-ink-100"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500/15 text-brand-300"><IconCalendar width={17} height={17} /></span>{t.memberAuth.myEvents}</span>
        <IconChevron width={18} height={18} className="text-ink-500 rtl:rotate-180" />
      </Link>

      {/*
        Nothing on, and nothing coming. Two different sentences, because a
        promoter with seven finished nights behind him is not somebody with
        no events — telling him so is the screen contradicting his own
        history, and the page used to say nothing at all instead.
      */}
      {empty ? (
        <section className="rounded-card border border-ink-700 bg-ink-850 p-5 text-center">
          <p className="text-[13.5px] leading-6 text-ink-400">{t.memberAuth.none}</p>
        </section>
      ) : !nextSeat && !nextEvent ? (
        <section className="rounded-card border border-ink-700 bg-ink-850 p-5 text-center">
          <p className="text-[13.5px] leading-6 text-ink-400">{t.memberAuth.noneUpcoming}</p>
        </section>
      ) : null}

      {/*
        Said on his own page rather than as a banner that follows him around:
        installing is worth doing once, and the moment he has just signed in is
        the moment it makes sense.
      */}
      {/* After the install guide: on an iPhone the one depends on the other. */}
      {/* The way back, for whoever is both. Shown only to a staff session. */}
      {staff ? (
        <Link href={homeFor(staff.role)} className="btn-ghost btn-sm w-full text-center">
          {t.memberAuth.backToStaff}
        </Link>
      ) : null}

    </MemberShell>
  );
}
