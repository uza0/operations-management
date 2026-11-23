import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentMember, touchMemberSession } from '@/server/services/member-auth';
import { currentUser, homeFor } from '@/server/auth/rbac';
import { getMemberHome } from '@/server/services/member-home';
import { memberLedger } from '@/server/services/credit';
import { getMemberCardStats } from '@/server/services/member-card';
import { ROLE_NAME } from '@/app/me/card/roles';
import { IconStar, IconPin } from '@/components/ui/icons';
import { getT } from '@/lib/i18n/server';
import { memberSignOutAction } from '@/server/actions/member-auth';
import { ConfirmSubmit } from '@/components/ui/client';
import { BalanceCard } from '@/app/me/BalanceCard';
import { OwedLines } from '@/app/me/OwedLines';
import { MoneyVisibilityProvider } from '@/app/me/MoneyVisibility';
import { CrewHandbookCard } from '@/app/me/CrewHandbookCard';
import { InstallGuide } from '@/app/me/InstallGuide';
import { ProfilePhotoUpload } from '@/app/me/ProfilePhotoUpload';
import { MemberShell } from '@/app/member/[token]/MemberShell';
import { OfflineStatus } from '@/components/pwa/MemberOfflineSync';

export const dynamic = 'force-dynamic';

export default async function MemberAccountPage() {
  const session = await currentMember();
  if (!session) redirect('/login?as=member');
  const [{ locale, t }, home, ledger, staff, stats] = await Promise.all([
    getT(), getMemberHome(session.teamMemberId), memberLedger(session.teamMemberId), currentUser(),
    getMemberCardStats(session.teamMemberId).catch(() => null),
  ]);
  if (!home) redirect('/login?as=member');
  await touchMemberSession(session.sessionId);
  const initials = home.person.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('');

  return <MemberShell>
    <section className="relative overflow-hidden rounded-card border border-ink-700 bg-ink-850">
      {/* cover: the brand red with the same rings the story cards use */}
      <div aria-hidden className="relative h-28 overflow-hidden bg-[#121317]">
        <div className="absolute -top-24 h-56 w-56 rounded-full bg-brand-500 ltr:-right-10 rtl:-left-10" />
        <div className="absolute -top-16 h-40 w-40 rounded-full border-2 border-[#121317]/70 ltr:-right-2 rtl:-left-2" />
        <p className="absolute top-4 text-[11px] font-bold tracking-[0.2em] text-white/85 ltr:left-4 rtl:right-4" dir="ltr">TICKET ZONE · CREW</p>
      </div>
      <div className="-mt-14 flex flex-col items-center px-4 pb-5 text-center">
        <div className="relative">
          <div className="grid h-28 w-28 place-items-center overflow-hidden rounded-full border-4 border-ink-850 bg-ink-800 text-3xl font-bold text-brand-300 shadow-lg ring-2 ring-brand-500">
            {home.person.photoUrl ? <img src={home.person.photoUrl} alt="" width={112} height={112} loading="lazy" className="h-28 w-28 object-cover" /> : initials}
          </div>
          <div className="absolute bottom-0 ltr:right-0 rtl:left-0">
            <ProfilePhotoUpload variant="avatar" pending={Boolean(home.person.pendingPhotoUrl)} labels={{ upload: t.memberAuth.profileChangePhoto, pending: t.memberAuth.photoPending, error: t.memberAuth.photoUploadError, tooLarge: t.memberAuth.photoTooLarge, success: t.memberAuth.photoUploaded }} />
          </div>
        </div>
        <h1 className="mt-3 text-[22px] font-bold leading-7 text-ink-100" style={{ unicodeBidi: 'plaintext' }}>{home.person.name}</h1>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-500/15 px-3 py-1 text-[12.5px] font-semibold text-brand-300">
          <IconStar width={13} height={13} />{(stats?.role && ROLE_NAME[locale === 'en' ? 'en' : 'ar'][stats.role]) || (locale === 'en' ? 'Ticket Zone Crew' : 'فريق تكت زون')}
        </p>
        {home.person.cardNumber ? <p className="nums mt-2 text-[12px] text-ink-400">{t.team.cardNumber}: <span dir="ltr" className="font-semibold text-ink-300">{home.person.cardNumber}</span></p> : null}
        {home.person.pendingPhotoUrl ? <p className="mt-2 text-[12px] leading-5 text-warn-text">{t.memberAuth.photoPending}</p> : !home.person.photoUrl ? <p className="mt-2 text-[12px] leading-5 text-ink-400">{t.memberAuth.photoNone}</p> : null}
        {stats ? <dl className="mt-4 grid w-full grid-cols-3 divide-x divide-ink-700 rounded-2xl border border-ink-700 bg-ink-800/60 py-3 rtl:divide-x-reverse">
          {[[t.memberAuth.profileEvents, String(stats.events)], stats.hours > 0 ? [t.memberAuth.profileHours, String(stats.hours)] : [t.memberAuth.profileVenues, String(stats.venues)], [t.memberAuth.profileSince, stats.since || '—']].map(([label, value]) => (
            <div key={label}><dd className="nums text-[20px] font-bold text-ink-100">{value}</dd><dt className="mt-0.5 text-[11.5px] text-ink-400">{label}</dt></div>
          ))}
        </dl> : null}
        {stats?.favouriteVenue ? <p className="mt-3 inline-flex items-center gap-1 text-[12px] text-ink-400"><IconPin width={13} height={13} />{stats.favouriteVenue.name}</p> : null}
        <Link href="/me/card" className="btn-primary btn-sm mt-4 inline-flex w-full items-center justify-center gap-2"><IconStar width={15} height={15} />{t.memberAuth.profileSeeCard}</Link>
      </div>
    </section>
    <MoneyVisibilityProvider>
      {ledger ? <BalanceCard t={t} locale={locale} ledger={ledger} salaried={Boolean(home.person.salaried)} /> : null}
      {ledger && !home.person.salaried ? <OwedLines t={t} locale={locale} ledger={ledger} /> : null}
    </MoneyVisibilityProvider>
    <CrewHandbookCard t={t} />
    <InstallGuide t={t} />
    {staff ? <Link href={homeFor(staff.role)} className="btn-ghost btn-sm w-full text-center">{t.memberAuth.backToStaff}</Link> : null}
    <OfflineStatus labels={{ title: t.pwa.offlineTitle, ready: t.pwa.offlineReady, none: t.pwa.offlineNone }} />
    <form action={memberSignOutAction} className="pt-1"><ConfirmSubmit className="btn-ghost btn-sm w-full" message={t.memberAuth.signOutConfirm}>{t.memberAuth.signOut}</ConfirmSubmit></form>
  </MemberShell>;
}
