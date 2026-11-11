import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getT } from '@/lib/i18n/server';
import { formatDate, formatTime } from '@/lib/time';
import { currentMember, touchMemberSession } from '@/server/services/member-auth';
import { currentUser, homeFor } from '@/server/auth/rbac';
import { getMemberHome } from '@/server/services/member-home';
import { getMemberAttendanceScore } from '@/server/services/member';
import {
  reminderText,
  sendDueReminders,
  sweepInBackground,
} from '@/server/services/push';

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
  sweepInBackground(async () => {
    const { t: text } = await getT();
    await sendDueReminders(reminderText(text));
  });

  const [{ locale, t }, home, staff, attendanceScore] = await Promise.all([
    getT(),
    getMemberHome(session.teamMemberId),
    currentUser(),
    getMemberAttendanceScore(session.teamMemberId),
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

  const empty =
    home.live.length === 0 &&
    home.upcoming.length === 0 &&
    home.past.length === 0 &&
    home.seatInvitations.length === 0;

  return (
    <MemberShell>
      <section className="rounded-card border border-ink-700 bg-ink-850 p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-ink-600 bg-ink-800 text-lg font-bold text-brand-300">
            {home.person.photoUrl ? <img src={home.person.photoUrl} alt="" width={56} height={56} loading="lazy" className="h-14 w-14 object-cover" /> : home.person.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('')}
          </div>
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold uppercase tracking-wide text-ink-500">{t.member.you}</p>
            <p className="mt-0.5 truncate text-[19px] font-bold leading-7 text-ink-100" style={{ unicodeBidi: 'plaintext' }}>{home.person.name}</p>
          </div>
        </div>
        {home.person.cardNumber ? (
          <p className="nums mt-1 text-[12.5px] text-ink-400" dir="ltr">
            {t.team.cardNumber}: {home.person.cardNumber}
          </p>
        ) : null}
      </section>

      <AttendanceScoreCard score={attendanceScore} t={t} compact />
      <Link href="/me/events" className="btn-ghost btn-sm w-full text-center">{t.memberAuth.myEvents}</Link>

      {nextSeat || nextEvent ? (
        <section className="rounded-card border border-brand-600/45 bg-brand-50/50 p-4">
          <p className="text-[12.5px] font-semibold text-brand-900">{t.memberAuth.nextStep}</p>
          <h2 className="mt-1 text-[16px] font-bold leading-6 text-ink-100">
            {nextSeat?.eventName ?? nextEvent?.name}
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-ink-300">
            {nextSeat
              ? t.memberAuth.nextStepSeat
              : home.live.length > 0
                ? t.memberAuth.nextStepLive
                : t.memberAuth.nextStepUpcoming}
          </p>
          {nextSeat && nextSeat.stage === 'INVITED' ? (
            <p className="mt-1 text-[12.5px] leading-5 text-ink-400">{t.memberAuth.nextStepSeatInvite}</p>
          ) : nextSeat ? (
            <p className="mt-1 text-[12.5px] leading-5 text-ink-400">{t.memberAuth.nextStepSeatProgress}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="nums text-[12.5px] text-ink-400">
              {formatDate(nextSeat?.date ?? nextEvent!.date, locale)} ·{' '}
              {formatTime(nextSeat?.startTime ?? nextEvent!.teamArrivalTime, locale)}
            </p>
            <Link
              href={nextSeat ? `/setup/${nextSeat.token}` : `/member/${nextEvent!.token}`}
              className="btn-primary btn-sm"
            >
              {t.memberAuth.nextStepOpen}
            </Link>
          </div>
        </section>
      ) : null}

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
