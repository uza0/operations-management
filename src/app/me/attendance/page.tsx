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
    <header><h1 className="text-xl font-bold text-ink-100">{t.memberAuth.navAttendance}</h1><p className="mt-1 text-sm text-ink-400">{t.member.attendanceScoreHint}</p></header>
    <AttendanceScoreCard score={score} t={t} />
    <section className="space-y-2">
      <h2 className="px-1 font-bold text-ink-100">{t.memberAuth.attendanceHistoryTitle}</h2>
      {completed.length === 0 ? <div className="rounded-card border border-ink-700 bg-ink-850 p-4 text-sm text-ink-400">{t.memberAuth.attendanceHistoryEmpty}</div> : completed.map((row, index) => {
        const selfRecorded = Boolean(row.reportedArrivalAt || row.reportedDepartureAt);
        const status = row.status as keyof typeof t.enums.attendanceStatus;
        return <article key={`${row.eventDate}-${index}`} className="rounded-card border border-ink-700 bg-ink-850 p-4">
          <div className="flex items-start justify-between gap-2"><div><h3 className="font-bold text-ink-100">{row.eventName}</h3><p className="mt-1 text-xs text-ink-400">{formatDate(row.eventDate, locale)} · {row.venue}</p></div><Badge tone={status === 'PRESENT' ? 'ok' : status === 'LATE' ? 'warn' : status === 'ABSENT' ? 'crit' : 'neutral'}>{t.enums.attendanceStatus[status]}</Badge></div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-300"><div><span className="block text-ink-500">{t.attendance.checkIn}</span><span className="nums">{row.checkInTime ? formatTime(row.checkInTime, locale) : clock(row.reportedArrivalAt)}</span></div><div><span className="block text-ink-500">{t.attendance.checkOut}</span><span className="nums">{row.checkOutTime ? formatTime(row.checkOutTime, locale) : clock(row.reportedDepartureAt)}</span></div></div>
          <p className="mt-3 border-t border-ink-700 pt-2 text-xs text-ink-400">{selfRecorded ? t.memberAuth.attendanceSelf : t.memberAuth.attendanceCorrected}</p>
        </article>;
      })}
    </section>
  </MemberShell>;
}
