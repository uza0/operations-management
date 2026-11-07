import Link from 'next/link';
import type { Dictionary } from '@/lib/i18n';

export type ReportView = 'general' | 'attendance' | 'expenses' | 'issues' | 'survey' | 'operations';

const views: ReportView[] = ['general', 'attendance', 'expenses', 'issues', 'survey', 'operations'];

export function ReportTypeSelector({
  eventId,
  base,
  current,
  canSeeFinance,
  t,
}: {
  eventId: string;
  base: '/admin' | '/leader';
  current: ReportView;
  canSeeFinance: boolean;
  t: Dictionary;
}) {
  const visibleViews = views.filter((view) => view !== 'expenses' || canSeeFinance);
  return (
    <nav aria-label={t.report.chooseReport} className="app-chrome mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {visibleViews.map((view) => (
        <Link
          key={view}
          href={`${base}/events/${eventId}/reports?view=${view}`}
          aria-current={current === view ? 'page' : undefined}
          className={`rounded-xl border px-3 py-3 text-start transition-colors ${
            current === view
              ? 'border-brand-500/60 bg-brand-900/30 text-ink-100'
              : 'border-ink-700 bg-ink-900 text-ink-300 hover:border-ink-500 hover:text-ink-100'
          }`}
        >
          <span className="block text-[13px] font-semibold">{t.report.views[view]}</span>
          <span className="mt-1 block text-[11px] leading-5 text-ink-500">{t.report.viewHints[view]}</span>
        </Link>
      ))}
    </nav>
  );
}
