import { format } from '@/lib/i18n';
import { Badge } from '@/components/ui/status';
import type { getMemberAttendanceScore } from '@/server/services/member';
import type { getT } from '@/lib/i18n/server';

type Score = Awaited<ReturnType<typeof getMemberAttendanceScore>>;
type T = Awaited<ReturnType<typeof getT>>['t'];

/**
 * How much of his own attendance he records himself.
 *
 * Shown in two places and therefore in two sizes. The attendance screen is
 * where somebody goes to look at this, so it explains itself in full. His
 * home page is not: there it is a reminder, and a reminder that repeats the
 * same four lines he read on the other screen is a reminder he stops seeing.
 */
export function AttendanceScoreCard({
  score,
  t,
  compact = false,
}: {
  score: Score;
  t: T;
  /** The home page's version: the figure, the bar, and what to do about it. */
  compact?: boolean;
}) {
  const level =
    score.total === 0
      ? null
      : score.percentage >= 90
        ? { label: t.member.attendanceScoreExcellent, hint: t.member.attendanceScoreExcellentHint, tone: 'ok' as const }
        : score.percentage >= 75
          ? { label: t.member.attendanceScoreGood, hint: t.member.attendanceScoreGoodHint, tone: 'info' as const }
          : score.percentage >= 50
            ? { label: t.member.attendanceScoreFair, hint: t.member.attendanceScoreFairHint, tone: 'warn' as const }
            : { label: t.member.attendanceScoreImprove, hint: t.member.attendanceScoreImproveHint, tone: 'crit' as const };

  return (
    <section className="rounded-card border border-ink-700 bg-ink-850 p-4" aria-labelledby="attendance-score-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="attendance-score-title" className="text-[14.5px] font-bold text-ink-100">
            {t.member.attendanceScoreTitle}
          </h2>
          {compact ? null : (
            <p className="mt-1 text-[12.5px] leading-5 text-ink-400">{t.member.attendanceScoreHint}</p>
          )}
        </div>
        {level ? <Badge tone={level.tone}>{level.label}</Badge> : null}
      </div>
      {score.total === 0 ? (
        <p className="mt-3 rounded-card border border-ink-700 bg-ink-900 px-3 py-2.5 text-[13px] text-ink-300">
          {t.member.attendanceScoreEmpty}
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium text-ink-200">
              {format(t.member.attendanceScoreCount, { completed: score.completed, total: score.total })}
            </p>
            <span className="nums shrink-0 text-[16px] font-bold text-ink-100">{score.percentage}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score.percentage} aria-label={t.member.attendanceScoreTitle}>
            <div className="h-full rounded-full bg-brand-500 transition-[width] duration-300" style={{ width: `${score.percentage}%` }} />
          </div>
          {level ? <p className="mt-2 text-[12.5px] text-ink-400">{level.hint}</p> : null}
          {compact ? null : (
            <p className="mt-2 border-t border-ink-700 pt-2 text-[12.5px] font-medium leading-5 text-ink-300">
              {score.rank !== null
                ? format(score.rank === 1 ? t.member.attendanceRankTop : t.member.attendanceRankPosition, { rank: score.rank, total: score.rankedPromoters })
                : t.member.attendanceRankPending}
            </p>
          )}
        </>
      )}
    </section>
  );
}
