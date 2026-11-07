import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getT } from '@/lib/i18n/server';
import { formatDate, formatTime } from '@/lib/time';
import { seatSetupInvitationByToken } from '@/server/services/seat-setup';

import { MemberShell, InvalidToken } from '../../member/[token]/MemberShell';
import { SeatSetupCard } from '../../member/[token]/SeatSetupCard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Chair setup invitation', robots: { index: false, follow: false } };

export default async function SeatSetupInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await seatSetupInvitationByToken(token);
  const { t, locale } = await getT();

  if (!invitation || invitation.shifts.length === 0) {
    return <InvalidToken title={t.member.invalidToken} hint={t.member.invalidTokenHint} />;
  }

  // Once the event is published, the ordinary event invitation owns the
  // promoter's view and the chair shift appears there alongside it.
  if (invitation.eventStatus !== 'DRAFT') redirect(`/member/${token}`);

  return (
    <MemberShell back="/me">
      <section className="rounded-card border border-ink-700 bg-ink-850 p-4">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-brand-300">
          {t.seatSetup.inviteTitle}
        </p>
        <h1
          className="mt-2 text-[20px] font-extrabold leading-7 text-ink-100"
          style={{ unicodeBidi: 'plaintext' }}
        >
          {invitation.eventName}
        </h1>
        <p className="mt-1 text-[13.5px] leading-6 text-ink-300">
          {t.seatSetup.inviteHint}
        </p>
      </section>

      <section className="rounded-card border border-ink-700 bg-ink-850 p-4">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-400">
          {t.seatSetup.memberTitle}
        </p>
        <ul className="mt-2 space-y-2.5">
          {invitation.shifts.map((shift) => (
            <SeatSetupCard
              key={shift.id}
              t={t}
              token={token}
              seatMemberId={shift.id}
              setupStatus="READY"
              stage={shift.stage}
              when={formatDate(shift.date, locale)}
              hours={
                formatTime(shift.startTime, locale) +
                (shift.endTime ? ` – ${formatTime(shift.endTime, locale)}` : '')
              }
              notes={shift.notes}
              pay={shift.payAmount}
              currency={t.credit.currency}
              arrivedAt={shift.checkInTime ? formatTime(shift.checkInTime, locale) : null}
            />
          ))}
        </ul>
      </section>

    </MemberShell>
  );
}
