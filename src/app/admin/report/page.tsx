import Link from 'next/link';

import { requireRole } from '@/server/auth/rbac';
import { getT } from '@/lib/i18n/server';
import { formatDateTime } from '@/lib/time';
import { collectInsights } from '@/server/services/insights';
import { defaultInsightRange, readRange } from '@/features/insights/range';
import { PrintButton } from '@/features/insights/PrintButton';
import {
  Bars,
  Figure,
  MonthTable,
  money,
  num,
  pct,
  rangeLabel,
  spanLabel,
} from '@/features/insights/parts';

/**
 * The report somebody hands to somebody else.
 *
 * Everything else in this system is built for a dark screen held in a
 * stairwell at nine at night. This one page is built for white paper and for
 * a reader who was not there: one period, one set of figures, and a plain
 * statement of what the system does and what it could do next. It carries no
 * navigation, no sidebar and no controls that survive printing, because
 * every one of those becomes a grey rectangle on the page.
 *
 * It is a read of the same numbers the statistics screen shows — never a
 * second calculation of them, which is how two screens come to disagree.
 */
export default async function SystemReport({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireRole('ADMIN');
  const { locale, t } = await getT();
  const { from, to } = await searchParams;
  const range = readRange(from, to) ?? defaultInsightRange();
  const data = await collectInsights(range);
  const span = spanLabel(data, locale);
  const report = t.insights.report;

  return (
    <div className="min-h-screen bg-neutral-100 py-6 print:bg-white print:py-0">
      <style>{`
        @page { size: A4; margin: 14mm 12mm; }
        @media print {
          html, body { background: #fff !important; }
          /*
           * The application's own print stylesheet strips every background on
           * the page, because the interface is dark and paper is not. On this
           * report the bars ARE backgrounds, so the few that carry meaning are
           * painted back by name — and asked for explicitly, since a browser
           * drops background colour when printing unless a page insists.
           */
          .sheet, .sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .sheet { background: #fff !important; }
          .rp-tile { background: #f6f4ef !important; }
          .rp-bar { background: #8a7a5c !important; }
          .rp-track { background: #e7e3da !important; }
          .no-print { display: none !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; width: auto !important; }
          .block-keep { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[820px] items-center justify-between gap-3 px-4">
        <Link href={`/admin/insights?from=${range.from}&to=${range.to}`} className="btn-ghost btn-sm">
          {t.insights.backToStats}
        </Link>
        <PrintButton t={t} />
      </div>

      <article className="sheet mx-auto max-w-[820px] bg-white px-10 py-9 text-[#1b1b1b] shadow-lg">
        {/* ---- masthead ------------------------------------------- */}
        <header className="border-b-2 border-[#1b1b1b] pb-4">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[#8a7a5c]">
            {t.app.name}
          </p>
          <h1 className="mt-1 text-[26px] font-bold leading-tight">{report.title}</h1>
          <p className="mt-1.5 text-[13px] text-[#555]">
            {t.insights.range}: {rangeLabel(range, locale)}
          </p>
          {span && span !== rangeLabel(range, locale) ? (
            <p className="mt-0.5 text-[12px] text-[#888]">{span}</p>
          ) : null}
        </header>

        <p className="mt-5 text-[13.5px] leading-7 text-[#333]">{report.intro}</p>

        {/* ---- the headline figures -------------------------------- */}
        <section className="rp-tile block-keep mt-6 grid grid-cols-4 gap-4 rounded-lg bg-[#f6f4ef] p-5">
          <Figure label={t.insights.events.total} value={num(data.events.total)} />
          <Figure label={t.insights.people.shifts} value={num(data.people.shifts)} />
          <Figure label={t.insights.people.worked} value={num(data.people.worked)} />
          <Figure
            label={t.insights.attendance.showRate}
            value={pct(data.attendance.showRate)}
          />
        </section>

        {/* ---- events ---------------------------------------------- */}
        <Section title={t.insights.sections.events}>
          <div className="grid grid-cols-4 gap-4">
            <Figure label={t.insights.events.closed} value={num(data.events.closed)} />
            <Figure label={t.insights.events.upcoming} value={num(data.events.upcoming)} />
            <Figure label={t.insights.events.venues} value={num(data.events.venues)} />
            <Figure
              label={t.insights.people.avgCrew}
              value={num(data.people.avgCrew, 1)}
              hint={t.insights.people.perEvent}
            />
          </div>
          {data.events.byType.length > 1 ? (
            <div className="mt-4">
              <p className="mb-2 text-[12px] font-semibold text-[#666]">
                {t.insights.events.byType}
              </p>
              <Bars
                rows={data.events.byType.map((row) => ({
                  label:
                    t.enums.eventType[row.key as keyof typeof t.enums.eventType] ??
                    row.key,
                  n: row.n,
                }))}
                barClassName="rp-bar bg-[#8a7a5c]"
                trackClassName="rp-track bg-[#e7e3da]"
              />
            </div>
          ) : null}
        </Section>

        {/* ---- attendance ------------------------------------------ */}
        <Section title={t.insights.sections.attendance}>
          <div className="grid grid-cols-4 gap-4">
            <Figure
              label={t.insights.attendance.lateRate}
              value={pct(data.attendance.lateRate)}
            />
            <Figure
              label={t.insights.attendance.selfReported}
              value={pct(data.attendance.selfReportedRate)}
              hint={t.insights.attendance.selfReportedHint}
            />
            <Figure
              label={t.insights.attendance.confirmRate}
              value={pct(data.invitations.confirmRate)}
            />
            <Figure
              label={t.insights.attendance.absent}
              value={num(data.attendance.absent)}
            />
          </div>
        </Section>

        {/* ---- money ----------------------------------------------- */}
        <Section title={t.insights.sections.money}>
          <div className="grid grid-cols-4 gap-4">
            <Figure
              label={t.insights.money.settled}
              value={money(data.money.settled)}
              hint={t.insights.money.settledHint}
            />
            <Figure label={t.insights.money.payouts} value={num(data.money.payouts)} />
            <Figure
              label={t.insights.money.perShift}
              value={data.money.perShift === null ? '—' : money(data.money.perShift)}
            />
            <Figure
              label={t.insights.money.expenses}
              value={money(data.money.expenses)}
            />
          </div>
        </Section>

        {/* ---- issues ---------------------------------------------- */}
        {data.issues.total > 0 ? (
          <Section title={t.insights.sections.issues}>
            <div className="grid grid-cols-4 gap-4">
              <Figure label={t.insights.issues.total} value={num(data.issues.total)} />
              <Figure
                label={t.insights.issues.resolvedRate}
                value={pct(data.issues.resolvedRate)}
              />
              <Figure
                label={t.insights.issues.medianMinutes}
                value={
                  data.issues.medianMinutes === null
                    ? '—'
                    : `${num(data.issues.medianMinutes)} ${t.insights.issues.minutes}`
                }
              />
              {data.feedback.averageRating !== null ? (
                <Figure
                  label={t.insights.feedback.average}
                  value={`${num(data.feedback.averageRating, 1)} ${t.insights.feedback.outOf}`}
                />
              ) : null}
            </div>
          </Section>
        ) : null}

        {/* ---- the shape over time --------------------------------- */}
        {data.months.length > 1 ? (
          <Section title={t.insights.sections.trend}>
            <MonthTable
              t={t}
              data={data.months}
              headClassName="text-[#777]"
              rowClassName="border-[#e4e0d8]"
              barClassName="rp-track bg-[#e7e3da]"
              fillClassName="rp-bar bg-[#8a7a5c]"
            />
          </Section>
        ) : null}

        {/* ---- the words ------------------------------------------- */}
        <Section title={report.whatTitle}>
          <Points items={report.what} />
        </Section>

        <Section title={report.aheadTitle}>
          <Points items={report.ahead} />
        </Section>

        <footer className="mt-8 flex items-center justify-between border-t border-[#ddd] pt-3 text-[11px] text-[#777]">
          <span>{report.footer}</span>
          <span className="nums">
            {t.insights.generatedAt}: {formatDateTime(data.generatedAt, locale)}
          </span>
        </footer>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="block-keep mt-7">
      <h2 className="mb-3 border-b border-[#ddd] pb-1.5 text-[15px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Points({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-[13px] leading-6 text-[#333]">
          <span aria-hidden className="rp-bar mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#8a7a5c]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
