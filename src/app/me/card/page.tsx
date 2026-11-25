import { redirect } from 'next/navigation';
import { currentMember } from '@/server/services/member-auth';
import { getMemberCardStats } from '@/server/services/member-card';
import { getT } from '@/lib/i18n/server';
import { MemberShell } from '@/app/member/[token]/MemberShell';
import { ShareStudio } from './ShareStudio';

export const dynamic = 'force-dynamic';

/** The member's own share cards: made from their record, posted by them. */
export default async function MemberCardPage() {
  const session = await currentMember();
  if (!session) redirect('/login?as=member');
  const [{ t, locale }, stats] = await Promise.all([getT(), getMemberCardStats(session.teamMemberId)]);
  if (!stats) redirect('/login?as=member');
  const m = t.memberAuth;
  return (
    <MemberShell>
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-ink-100">{m.cardTitle}</h1>
        <p className="text-sm text-ink-400">{m.cardHint}</p>
      </header>
      <ShareStudio
        stats={stats}
        initialLang={locale === 'en' ? 'en' : 'ar'}
        copy={{
          share: m.cardShare, save: m.cardSave, working: m.cardWorking, failed: m.cardFailed, hint: m.cardHint,
          arabic: m.cardArabic, english: m.cardEnglish, stickerNote: m.cardStickerNote,
          names: { poster: m.cardPoster, upcoming: m.cardUpcoming, badge: m.cardBadge, passport: m.cardPassport, season: m.cardSeason, sticker: m.cardSticker, crew: m.cardCrew, ticket: m.cardTicket },
        }}
      />
    </MemberShell>
  );
}
