import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getT } from '@/lib/i18n/server';
import { formatDate, formatTime } from '@/lib/time';
import { currentMember, touchMemberSession } from '@/server/services/member-auth';
import { currentUser, homeFor } from '@/server/auth/rbac';
import { getMemberHome, type MemberHome } from '@/server/services/member-home';
import { memberLedger } from '@/server/services/credit';
import { memberSignOutAction } from '@/server/actions/member-auth';
import { Badge, eventStatusTone } from '@/components/ui/status';
import { ConfirmSubmit } from '@/components/ui/client';
import { IconCalendar, IconClock, IconPin } from '@/components/ui/icons';
import type { EventStatus, EventType } from '@/lib/constants';

import { MemberShell } from '../member/[token]/MemberShell';
import { BalanceCard } from './BalanceCard';
import { InstallGuide } from './InstallGuide';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'TicketZone Ops' };

type T = Awaited<ReturnType<typeof getT>>['t'];
type Locale = Awaited<ReturnType<typeof getT>>['locale'];
type Row = MemberHome['live'][number];

function EventCard({ t, locale, row }: { t: T; locale: Locale; row: Row }) {
  return (
    <Link
      href={`/member/${row.token}`}
      className="block rounded-card border border-ink-700 bg-ink-850 p-4 transition-colors hover:border-ink-600"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3
          className="min-w-0 flex-1 text-[15px] font-bold leading-6 text-ink-100"
          style={{ unicodeBidi: 'plaintext' }}
        >
          {row.name}
        </h3>
        <Badge
          tone={eventStatusTone[row.eventStatus as EventStatus]}
          pulse={row.eventStatus === 'LIVE'}
        >
          {t.enums.eventStatus[row.eventStatus as EventStatus]}
        </Badge>
      </div>

      <p className="text-[12.5px] text-ink-400">
        {t.enums.eventType[row.type as EventType]}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
        <div className="flex items-center gap-1.5 text-ink-300">
          <IconCalendar width={14} height={14} className="shrink-0 text-ink-500" />
          <span className="nums truncate">{formatDate(row.date, locale)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-ink-300">
          <IconClock width={14} height={14} className="shrink-0 text-ink-500" />
          <span className="nums truncate">{formatTime(row.teamArrivalTime, locale)}</span>
        </div>
        <div className="col-span-2 flex items-center gap-1.5 text-ink-300">
          <IconPin width={14} height={14} className="shrink-0 text-ink-500" />
          <span className="truncate">{row.venue}</span>
        </div>
      </dl>
    </Link>
  );
}

function Group({
  t,
  locale,
  title,
  rows,
}: {
  t: T;
  locale: Locale;
  title: string;
  rows: Row[];
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 px-1 text-[15px] font-bold text-ink-100">{title}</h2>
      <div className="space-y-2.5">
        {rows.map((row) => (
          <EventCard key={row.token} t={t} locale={locale} row={row} />
        ))}
      </div>
    </section>
  );
}

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

  const [{ locale, t }, home, ledger, staff] = await Promise.all([
    getT(),
    getMemberHome(session.teamMemberId),
    memberLedger(session.teamMemberId),
    currentUser(),
  ]);

  if (!home) redirect('/login');
  await touchMemberSession(session.sessionId);

  const empty =
    home.live.length === 0 && home.upcoming.length === 0 && home.past.length === 0;

  return (
    <MemberShell>
      <section className="rounded-card border border-ink-700 bg-ink-850 p-4">
        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-500">
          {t.member.you}
        </p>
        <p
          className="mt-1 text-[19px] font-bold leading-7 text-ink-100"
          style={{ unicodeBidi: 'plaintext' }}
        >
          {home.person.name}
        </p>
        {home.person.cardNumber ? (
          <p className="nums mt-1 text-[12.5px] text-ink-400" dir="ltr">
            {t.team.cardNumber}: {home.person.cardNumber}
          </p>
        ) : null}
      </section>

      {/*
        What he is owed, straight under his name. It is the question he opens
        this page to answer at least as often as "where am I standing", and
        until now the only way to ask it was to ring somebody.
      */}
      {ledger ? (
        <BalanceCard
          t={t}
          locale={locale}
          ledger={ledger}
          salaried={Boolean(home.person.salaried)}
        />
      ) : null}

      {empty ? (
        <section className="rounded-card border border-ink-700 bg-ink-850 p-6 text-center">
          <p className="text-[13.5px] leading-6 text-ink-400">{t.memberAuth.none}</p>
        </section>
      ) : (
        <>
          <Group t={t} locale={locale} title={t.memberAuth.live} rows={home.live} />
          <Group t={t} locale={locale} title={t.memberAuth.upcoming} rows={home.upcoming} />
          <Group t={t} locale={locale} title={t.memberAuth.past} rows={home.past} />
        </>
      )}

      {/*
        Said on his own page rather than as a banner that follows him around:
        installing is worth doing once, and the moment he has just signed in is
        the moment it makes sense.
      */}
      <InstallGuide t={t} />

      {/* The way back, for whoever is both. Shown only to a staff session. */}
      {staff ? (
        <Link href={homeFor(staff.role)} className="btn-ghost btn-sm w-full text-center">
          {t.memberAuth.backToStaff}
        </Link>
      ) : null}

      {/*
        Asked before it happens.
        
        This sits at the bottom of the one page he opens every working day, a
        thumb's width from the install guide, and pressing it by mistake threw
        him straight out — back to a door he has to find his code for again.
        Nothing on this page is worth losing to a mis-tap.
      */}
      <form action={memberSignOutAction} className="pt-1">
        <ConfirmSubmit
          className="btn-ghost btn-sm w-full"
          message={t.memberAuth.signOutConfirm}
        >
          {t.memberAuth.signOut}
        </ConfirmSubmit>
      </form>
    </MemberShell>
  );
}
