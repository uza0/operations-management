import Link from 'next/link';

import { getT } from '@/lib/i18n/server';
import { PageHeader, Panel } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/states';
import { IconPrint } from '@/components/ui/icons';
import { formatDateTime } from '@/lib/time';
import { collectInsights, type Range } from '@/server/services/insights';
import { RangePicker } from './RangePicker';
import { Bars, Figure, MonthTable, money, num, pct, rangeLabel, spanLabel } from './parts';

/**
 * The operation, read as a whole.
 *
 * Every other admin screen is about tonight. This one is about the year: how
 * many evenings were run, by how many people, how reliably they turned up,
 * what it cost, and what went wrong while it was happening. It is the screen
 * somebody opens when they are deciding whether the operation is working,
 * not when they are running it — so it carries no actions at all, and
 * nothing on it can change a single row.
 */
export async function InsightsPage({ range }: { range: Range }) {
  const { locale, t } = await getT();
  const data = await collectInsights(range);
  const empty = data.events.total === 0;
  const span = spanLabel(data, locale);

  return (
    <>
      <PageHeader
        title={t.insights.title}
        subtitle={t.insights.subtitle}
        action={
          <Link
            href={`/admin/report?from=${range.from}&to=${range.to}`}
            className="btn-primary btn-sm inline-flex items-center gap-1.5"
          >
            <IconPrint className="h-4 w-4" />
            {t.insights.print}
          </Link>
        }
      />

      <div className="space-y-4">
        <Panel
          title={`${t.insights.range}: ${rangeLabel(range, locale)}`}
          subtitle={span && span !== rangeLabel(range, locale) ? span : undefined}
        >
          <RangePicker t={t} range={range} path="/admin/insights" />
        </Panel>

        {empty ? (
          <EmptyState title={t.insights.noData} />
        ) : (
          <>
            {/* ---- events ------------------------------------------- */}
            <Panel title={t.insights.sections.events}>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <Figure
                  label={t.insights.events.total}
                  value={num(data.events.total)}
                  hint={t.insights.events.totalHint}
                  valueClassName="text-brand-300"
                />
                <Figure
                  label={t.insights.events.closed}
                  value={num(data.events.closed)}
                />
                <Figure
                  label={t.insights.events.upcoming}
                  value={num(data.events.upcoming)}
                />
                <Figure
                  label={t.insights.events.venues}
                  value={num(data.events.venues)}
                />
              </div>
              <div className="mt-5 border-t border-ink-800 pt-4">
                <p className="mb-2.5 text-[12.5px] font-semibold text-ink-400">
                  {t.insights.events.byType}
                </p>
                <Bars
                  rows={data.events.byType.map((row) => ({
                    label:
                      t.enums.eventType[row.key as keyof typeof t.enums.eventType] ??
                      row.key,
                    n: row.n,
                  }))}
                />
              </div>
            </Panel>

            {/* ---- people ------------------------------------------- */}
            <Panel title={t.insights.sections.people}>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <Figure
                  label={t.insights.people.shifts}
                  value={num(data.people.shifts)}
                  hint={t.insights.people.shiftsHint}
                  valueClassName="text-brand-300"
                />
                <Figure
                  label={t.insights.people.worked}
                  value={num(data.people.worked)}
                />
                <Figure
                  label={t.insights.people.avgCrew}
                  value={num(data.people.avgCrew, 1)}
                  hint={t.insights.people.perEvent}
                />
                <Figure
                  label={t.insights.people.seatShifts}
                  value={num(data.people.seatShifts)}
                />
                <Figure
                  label={t.insights.people.activeNow}
                  value={num(data.people.activeNow)}
                  hint={t.insights.people.activeNowHint}
                />
                <Figure
                  label={t.insights.people.joined}
                  value={num(data.people.joined)}
                />
              </div>

              {data.people.top.length > 0 ? (
                <div className="mt-5 border-t border-ink-800 pt-4">
                  <p className="mb-2.5 text-[12.5px] font-semibold text-ink-400">
                    {t.insights.sections.top}
                  </p>
                  <Bars
                    rows={data.people.top.map((row) => ({
                      label: row.name,
                      n: row.shifts,
                    }))}
                  />
                </div>
              ) : null}
            </Panel>

            {/* ---- attendance --------------------------------------- */}
            <Panel title={t.insights.sections.attendance}>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <Figure
                  label={t.insights.attendance.showRate}
                  value={pct(data.attendance.showRate)}
                  hint={t.insights.attendance.showRateHint}
                  valueClassName="text-ok-text"
                />
                <Figure
                  label={t.insights.attendance.lateRate}
                  value={pct(data.attendance.lateRate)}
                  valueClassName="text-warn-text"
                />
                <Figure
                  label={t.insights.attendance.selfReported}
                  value={pct(data.attendance.selfReportedRate)}
                  hint={t.insights.attendance.selfReportedHint}
                />
                <Figure
                  label={t.insights.attendance.confirmRate}
                  value={pct(data.invitations.confirmRate)}
                  hint={`${num(data.invitations.confirmed)} / ${num(
                    data.invitations.sent,
                  )}`}
                />
              </div>
              <div className="mt-5 border-t border-ink-800 pt-4">
                <Bars
                  rows={[
                    { label: t.insights.attendance.present, n: data.attendance.present },
                    { label: t.insights.attendance.late, n: data.attendance.late },
                    { label: t.insights.attendance.absent, n: data.attendance.absent },
                    { label: t.insights.attendance.excused, n: data.attendance.excused },
                    {
                      label: t.insights.attendance.unrecorded,
                      n: data.attendance.unrecorded,
                    },
                  ].filter((row) => row.n > 0)}
                />
              </div>
            </Panel>

            {/* ---- money -------------------------------------------- */}
            <Panel title={t.insights.sections.money}>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <Figure
                  label={t.insights.money.settled}
                  value={money(data.money.settled)}
                  hint={`${t.insights.money.settledHint} · ${num(
                    data.money.payouts,
                  )} ${t.insights.money.payouts}`}
                  valueClassName="text-brand-300"
                />
                <Figure
                  label={t.insights.money.owedNow}
                  value={money(data.money.owedNow)}
                  valueClassName="text-warn-text"
                />
                <Figure
                  label={t.insights.money.perShift}
                  value={data.money.perShift === null ? '—' : money(data.money.perShift)}
                />
                <Figure
                  label={t.insights.money.expenses}
                  value={money(data.money.expenses)}
                />
              </div>
            </Panel>

            {/* ---- issues ------------------------------------------- */}
            {data.issues.total > 0 ? (
              <Panel title={t.insights.sections.issues}>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <Figure
                    label={t.insights.issues.total}
                    value={num(data.issues.total)}
                  />
                  <Figure
                    label={t.insights.issues.resolvedRate}
                    value={pct(data.issues.resolvedRate)}
                    valueClassName="text-ok-text"
                  />
                  <Figure
                    label={t.insights.issues.medianMinutes}
                    value={
                      data.issues.medianMinutes === null
                        ? '—'
                        : `${num(data.issues.medianMinutes)} ${t.insights.issues.minutes}`
                    }
                  />
                </div>
                <div className="mt-5 border-t border-ink-800 pt-4">
                  <p className="mb-2.5 text-[12.5px] font-semibold text-ink-400">
                    {t.insights.issues.byType}
                  </p>
                  <Bars
                    rows={data.issues.byType.map((row) => ({
                      label:
                        t.enums.issueType[row.key as keyof typeof t.enums.issueType] ??
                        row.key,
                      n: row.n,
                    }))}
                  />
                </div>
              </Panel>
            ) : null}

            {/* ---- feedback ----------------------------------------- */}
            {data.feedback.responses > 0 ? (
              <Panel title={t.insights.sections.feedback}>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <Figure
                    label={t.insights.feedback.average}
                    value={
                      data.feedback.averageRating === null
                        ? '—'
                        : `${num(data.feedback.averageRating, 1)} ${t.insights.feedback.outOf}`
                    }
                    valueClassName="text-ok-text"
                  />
                  <Figure
                    label={t.insights.feedback.responses}
                    value={num(data.feedback.responses)}
                  />
                  <Figure
                    label={t.insights.feedback.responseRate}
                    value={pct(data.feedback.responseRate)}
                  />
                </div>
              </Panel>
            ) : null}

            {/* ---- the shape over time ------------------------------ */}
            {data.months.length > 1 ? (
              <Panel title={t.insights.sections.trend}>
                <MonthTable t={t} data={data.months} />
              </Panel>
            ) : null}
          </>
        )}

        <p className="px-1 text-[11.5px] text-ink-500">
          {t.insights.generatedAt}: {formatDateTime(data.generatedAt, locale)}
        </p>
      </div>
    </>
  );
}
