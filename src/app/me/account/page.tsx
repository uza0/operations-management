import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentMember, touchMemberSession } from '@/server/services/member-auth';
import { currentUser, homeFor } from '@/server/auth/rbac';
import { getMemberHome } from '@/server/services/member-home';
import { memberLedger } from '@/server/services/credit';
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

export const dynamic = 'force-dynamic';

export default async function MemberAccountPage() {
  const session = await currentMember();
  if (!session) redirect('/login?as=member');
  const [{ locale, t }, home, ledger, staff] = await Promise.all([
    getT(), getMemberHome(session.teamMemberId), memberLedger(session.teamMemberId), currentUser(),
  ]);
  if (!home) redirect('/login?as=member');
  await touchMemberSession(session.sessionId);
  const initials = home.person.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('');

  return <MemberShell>
    <header><h1 className="text-xl font-bold text-ink-100">{t.memberAuth.navAccount}</h1><p className="mt-1 text-sm text-ink-400">{t.member.you}</p></header>
    <section className="rounded-card border border-ink-700 bg-ink-850 p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-ink-600 bg-ink-800 text-xl font-bold text-brand-300">
          {home.person.photoUrl ? <img src={home.person.photoUrl} alt="" width={64} height={64} loading="lazy" className="h-16 w-16 object-cover" /> : initials}
        </div>
        <div className="min-w-0"><p className="truncate text-lg font-bold text-ink-100" style={{ unicodeBidi: 'plaintext' }}>{home.person.name}</p>{home.person.cardNumber ? <p className="nums mt-1 text-xs text-ink-400" dir="ltr">{t.team.cardNumber}: {home.person.cardNumber}</p> : null}</div>
      </div>
      <div className="mt-4 border-t border-ink-700 pt-3">
        <h2 className="mb-2 text-sm font-bold text-ink-100">{t.memberAuth.photoTitle}</h2>
        <p className="mb-2 text-xs leading-5 text-ink-400">{home.person.pendingPhotoUrl ? t.memberAuth.photoPending : home.person.photoUrl ? t.memberAuth.photoApproved : t.memberAuth.photoNone}</p>
        <ProfilePhotoUpload pending={Boolean(home.person.pendingPhotoUrl)} labels={{ upload: home.person.photoUrl || home.person.pendingPhotoUrl ? t.memberAuth.photoReplace : t.memberAuth.photoUpload, pending: t.memberAuth.photoPending, error: t.memberAuth.photoUploadError, tooLarge: t.memberAuth.photoTooLarge, success: t.memberAuth.photoUploaded }} />
      </div>
    </section>
    <MoneyVisibilityProvider>
      {ledger ? <BalanceCard t={t} locale={locale} ledger={ledger} salaried={Boolean(home.person.salaried)} /> : null}
      {ledger && !home.person.salaried ? <OwedLines t={t} locale={locale} ledger={ledger} /> : null}
    </MoneyVisibilityProvider>
    <CrewHandbookCard t={t} />
    <InstallGuide t={t} />
    {staff ? <Link href={homeFor(staff.role)} className="btn-ghost btn-sm w-full text-center">{t.memberAuth.backToStaff}</Link> : null}
    <form action={memberSignOutAction} className="pt-1"><ConfirmSubmit className="btn-ghost btn-sm w-full" message={t.memberAuth.signOutConfirm}>{t.memberAuth.signOut}</ConfirmSubmit></form>
  </MemberShell>;
}
