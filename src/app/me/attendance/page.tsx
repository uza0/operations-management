import { redirect } from 'next/navigation';
import { currentMember } from '@/server/services/member-auth';
import { getMemberAttendanceHistory, getMemberAttendanceScore } from '@/server/services/member';
import { getT } from '@/lib/i18n/server';
import { formatDate, formatTime } from '@/lib/time';
import { Badge } from '@/components/ui/status';
import { AttendanceScoreCard } from '@/app/me/AttendanceScoreCard';
import { MemberShell } from '@/app/member/[token]/MemberShell';

export const dynamic = 'force-dynamic';

export default async function MemberAttendancePage() {
  const session = await currentMember();
  if (!session) redirect('/login?as=member');
  const [{ t, locale }, score, history] = await Promise.all([
    getT(), getMemberAttendanceScore(session.teamMemberId), getMemberAttendanceHistory(session.teamMemberId),
  ]);
  const completed = history.filter((row) => row.status && row.status !== 'PENDING');
  const clock = (value: Date | null) => value?.toLocaleTimeString(locale === 'ar' ? 'ar-IQ' : 'en-US', { timeZone: 'Asia/Baghdad', hour: 'numeric', minute: '2-digit' }) ?? null;
  return <MemberShell>
    {/*
      The heading alone. The sentence that used to sit here is the card's
      own, word for word, and a paragraph printed twice on one screen is
      read as two different things until somebody compares them.
    */}
    <header><h1 className="text-xl font-bold text-ink-100">{t.memberAuth.navAttendance}</h1></header>
    <AttendanceScoreCard score={score} t={t} />
    {completed.length ? (
      /* The night-by-night record in four numbers, before the list itself. */
      <section className="grid grid-cols-4 gap-2">
        {[
          [t.enums.attendanceStatus.PRESENT, completed.filter((r) => r.status === 'PRESENT').length, 'text-ok-text'],
          [t.enums.attendanceStatus.LATE, completed.filter((r) => r.status === 'LATE').length, 'text-warn-text'],
          [t.enums.attendanceStatus.ABSENT, completed.filter((r) => r.status === 'ABSENT').length, 'text-crit-text'],
          [t.memberAuth.attendanceSelfShort, completed.filter((r) => r.reportedArrivalAt || r.reportedDepartureAt).length, 'text-info-text'],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className="rounded-2xl border border-ink-700 bg-ink-850 px-2 py-3 text-center">
            <p className={`nums text-[20px] font-bold ${tone}`}>{value}</p>
            <p className="mt-0.5 truncate text-[11px] text-ink-400">{label}</p>
          </div>
        ))}
      </section>
    ) : null}
    <section className="space-y-2.5">
      <h2 className="px-1 font-bold text-ink-100">{t.memberAuth.attendanceHistoryTitle}</h2>
      {completed.length === 0 ? <div className="rounded-card border border-ink-700 bg-ink-850 p-4 text-sm text-ink-400">{t.memberAuth.attendanceHistoryEmpty}</div> : completed.map((row, index) => {
        const selfRecorded = Boolean(row.reportedArrivalAt || row.reportedDepartureAt);
        const status = row.status as keyof typeof t.enums.attendanceStatus;
        const tone = status === 'PRESENT' ? 'ok' : status === 'LATE' ? 'warn' : status === 'ABSENT' ? 'crit' : 'neutral';
        const stripe = status === 'PRESENT' ? 'bg-ok' : status === 'LATE' ? 'bg-warn' : status === 'ABSENT' ? 'bg-crit' : 'bg-ink-600';
        const inAt = row.checkInTime ? formatTime(row.checkInTime, locale) : clock(row.reportedArrivalAt);
        const outAt = row.checkOutTime ? formatTime(row.checkOutTime, locale) : clock(row.reportedDepartureAt);
        const day = Number(row.eventDate.slice(8, 10));
        const month = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ar-IQ', { month: 'short', timeZone: 'UTC' }).format(new Date(row.eventDate + 'T00:00:00Z'));
        return <article key={`${row.eventDate}-${index}`} className="relative flex gap-3 overflow-hidden rounded-card border border-ink-700 bg-ink-850 p-3.5">
          <span aria-hidden className={`absolute inset-y-0 w-1 ${stripe} ltr:left-0 rtl:right-0`} />
          {/* The poster when the evening has one, otherwise its date as a block. */}
          {row.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- immutable /uploads/ image
            <img src={row.posterUrl} alt="" loading="lazy" className="h-[72px] w-[58px] shrink-0 rounded-xl object-cover" style={{ objectPosition: '50% 20%' }} />
          ) : (
            <div className="flex h-[72px] w-[58px] shrink-0 flex-col items-center justify-center rounded-xl bg-ink-800 text-ink-100">
              <span className="nums text-[22px] font-bold leading-6">{day}</span>
              <span className="text-[10.5px] font-semibold text-ink-400">{month}</span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-2 text-[14.5px] font-bold leading-5 text-ink-100" style={{ unicodeBidi: 'plaintext' }}>{row.eventName}</h3>
              <Badge tone={tone}>{t.enums.attendanceStatus[status]}</Badge>
            </div>
            <p className="mt-0.5 truncate text-[11.5px] text-ink-400">{formatDate(row.eventDate, locale)} · {row.venue}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
              {inAt || outAt ? (
                <span className="nums inline-flex items-center gap-1.5 rounded-full bg-ink-800 px-2.5 py-1 font-semibold text-ink-200">
                  <span>{inAt ?? '—'}</span><span aria-hidden className="text-ink-500 rtl:rotate-180">→</span><span>{outAt ?? '—'}</span>
                </span>
              ) : null}
              <span className={`rounded-full px-2.5 py-1 font-semibold ${selfRecorded ? 'bg-ok/15 text-ok-text' : 'bg-ink-800 text-ink-400'}`}>{selfRecorded ? `✓ ${t.memberAuth.attendanceSelf}` : t.memberAuth.attendanceCorrected}</span>
            </div>
          </div>
        </article>;
      })}
    </section>
  </MemberShell>;
}
