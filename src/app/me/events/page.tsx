import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentMember } from '@/server/services/member-auth';
import { getMemberHome } from '@/server/services/member-home';
import { getT } from '@/lib/i18n/server';
import { formatDate, formatTime } from '@/lib/time';
import { Badge, eventStatusTone } from '@/components/ui/status';
import { IconCalendar, IconClock, IconPin } from '@/components/ui/icons';
import { MemberShell } from '@/app/member/[token]/MemberShell';
import type { EventStatus, EventType } from '@/lib/constants';
import { typeSkin } from '@/lib/event-type';

export const dynamic = 'force-dynamic';

/** An evening is only owed once it is over. */
const CLOSED = ['COMPLETED', 'ARCHIVED'];

export default async function MemberEventsPage() {
  const session = await currentMember();
  if (!session) redirect('/login?as=member');
  const [{ t, locale }, home] = await Promise.all([getT(), getMemberHome(session.teamMemberId)]);
  if (!home) redirect('/login?as=member');
  const sections = [
    [t.memberAuth.live, home.live],
    [t.memberAuth.upcoming, home.upcoming],
    [t.memberAuth.past, home.past],
  ] as const;
  return <MemberShell>
    <header><h1 className="text-xl font-bold text-ink-100">{t.memberAuth.navEvents}</h1><p className="mt-1 text-sm text-ink-400">{t.memberAuth.myEvents}</p></header>
    {home.seatInvitations.length ? <section className="space-y-2"><h2 className="font-bold text-ink-100">{t.seatSetup.invitationSection}</h2>{home.seatInvitations.map((row) => <Link key={row.shiftId} href={`/setup/${row.token}`} className="block rounded-card border border-brand-700/60 bg-ink-850 p-4"><div className="flex justify-between gap-2"><strong className="text-ink-100">{row.eventName}</strong><Badge tone={row.declinedAt ? 'crit' : row.confirmedAt ? 'ok' : 'warn'}>{row.declinedAt ? t.seatSetup.declinedCard : row.confirmedAt ? t.seatSetup.confirmedList : t.seatSetup.waitingReply}</Badge></div><p className="mt-2 text-sm text-ink-300">{formatDate(row.date, locale)} · {formatTime(row.startTime, locale)}</p><p className="mt-1 text-xs text-brand-300">{t.seatSetup.inviteTitle}</p></Link>)}</section> : null}
    {sections.map(([title, rows]) => rows.length ? <section key={title} className="space-y-2"><h2 className="px-1 font-bold text-ink-100">{title}</h2>{rows.map((row) => <Link key={row.token} href={`/member/${row.token}`} style={typeSkin(row.type, '--ink-850').surface} className="block rounded-card border p-4 transition-colors hover:brightness-110"><div className="flex items-start justify-between gap-2"><h3 className="line-clamp-2 font-bold text-ink-100">{row.name}</h3><div className="flex shrink-0 flex-wrap justify-end gap-1.5">{/*
      Paid or still owed, said on the night it belongs to.

      The balance above gives him two totals; what it cannot tell him is
      which of these names each total is made of — and that is the question
      he actually rings the leader about. An evening still running carries
      neither mark: there is nothing owed for work that has not happened.
    */}{row.paid ? <Badge tone="ok">{t.memberAuth.paidBadge}</Badge> : CLOSED.includes(row.eventStatus) ? <Badge tone="warn">{t.memberAuth.owedBadge}</Badge> : null}<Badge tone={eventStatusTone[row.eventStatus as EventStatus]} pulse={row.eventStatus === 'LIVE'}>{t.enums.eventStatus[row.eventStatus as EventStatus]}</Badge></div></div><p className="mt-1 text-xs font-semibold" style={typeSkin(row.type).label}>{t.enums.eventType[row.type as EventType]}</p><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-300"><span className="flex items-center gap-1"><IconCalendar width={14}/>{formatDate(row.date, locale)}</span><span className="flex items-center gap-1"><IconClock width={14}/>{formatTime(row.teamArrivalTime, locale)}</span><span className="col-span-2 flex items-center gap-1"><IconPin width={14}/>{row.venue}</span></div></Link>)}</section> : null)}
    {!home.live.length && !home.upcoming.length && !home.past.length && !home.seatInvitations.length ? <section className="panel p-5 text-center text-sm text-ink-400">{t.memberAuth.none}</section> : null}
  </MemberShell>;
}
