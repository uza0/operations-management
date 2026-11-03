import { getT } from '@/lib/i18n/server';
import { formatAmount } from '@/lib/money';
import { format } from '@/lib/i18n';
import { PageHeader, Panel } from '@/components/ui/panel';
import { EmptyState, Notice } from '@/components/ui/states';
import { listHandovers, oldestOwed } from '@/server/actions/payment-file';
import { previewExport } from '@/server/services/payment-file';

import { GenerateForm } from './GenerateForm';
import { HandoverList } from './HandoverList';

/**
 * The week's file: what would go in it, what would stop it, and one button.
 *
 * The leader's job used to be typing a hundred and twenty rows out of this
 * system into the company's workbook, which is a hundred and twenty chances
 * to mistype a bank account. Now his job is the part only a person can do:
 * reading what is about to be sent and deciding to send it.
 *
 * So the figures come first and the button last, and the button is refused
 * outright while anything in the file would be unpayable. A warning the eye
 * skips over is how a man ends up unpaid for a week.
 */
export async function PaymentFilePage({
  base,
  from,
  to,
}: {
  base: '/admin' | '/leader';
  from?: string;
  to?: string;
}) {
  const { t, locale } = await getT();

  /* Default to the week that just ended, which is what they are paid for. */
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const range = { from: from ?? iso(monday), to: to ?? iso(sunday) };
  const [preview, handovers, oldest] = await Promise.all([
    previewExport(range),
    listHandovers(),
    oldestOwed(),
  ]);

  const { bundle } = preview;
  const nothing = bundle.fees.length === 0 && bundle.costs.length === 0;

  return (
    <>
      <PageHeader title={t.payment.title} subtitle={t.payment.subtitle} />

      {!preview.template ? (
        <Notice tone="warn">{t.payment.templateNone}</Notice>
      ) : null}

      {oldest && oldest < range.from ? (
        <div className="mb-4">
          <Notice tone="warn">{format(t.payment.oldestOwed, { date: oldest })}</Notice>
        </div>
      ) : null}

      <GenerateForm
        base={base}
        t={t}
        range={range}
        disabled={!preview.template || nothing || preview.blockers.length > 0}
      />

      <Panel title={t.payment.range} className="mt-4">
        {nothing ? (
          <EmptyState title={t.payment.nothing} hint={t.payment.nothingHint} />
        ) : (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {[
              [t.payment.fees, `${formatAmount(bundle.feesTotal)} ${t.credit.currency}`],
              [t.payment.costs, `${formatAmount(bundle.costsTotal)} ${t.credit.currency}`],
              [t.payment.people, String(bundle.people)],
              [t.payment.rows, String(bundle.fees.length + bundle.costs.length)],
              [t.payment.events, String(bundle.eventList.length)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[12px] text-ink-500">{label}</dt>
                <dd className="nums mt-0.5 text-[16px] font-bold text-ink-100">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Panel>

      {preview.blockers.length ? (
        <Panel title={t.payment.blocked} className="mt-4">
          <p className="mb-3 text-[12.5px] leading-6 text-ink-400">{t.payment.blockedWhy}</p>
          <ul className="space-y-1.5 text-[13.5px]">
            {preview.blockers.map((b) => (
              <li key={`${b.kind}-${b.label}`} className="flex flex-wrap gap-x-2">
                <span className="font-semibold text-ink-100" style={{ unicodeBidi: 'plaintext' }}>
                  {b.label}
                </span>
                <span className="text-crit-text">
                  {b.kind === 'NO_CARD'
                    ? t.payment.noCard
                    : b.kind === 'NOT_REGISTERED'
                      ? t.payment.notRegistered
                      : b.kind === 'SHARED_ACCOUNT'
                        ? t.payment.sharedAccount
                        : t.payment.noEventId}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {preview.shared.length ? (
        <Panel title={t.payment.sharedWarn} className="mt-4">
          <p className="mb-3 text-[12.5px] leading-6 text-ink-400">{t.payment.sharedWarnWhy}</p>
          <ul className="space-y-1 text-[13.5px] text-ink-200">
            {preview.shared.map((row) => (
              <li key={row.account} className="flex flex-wrap gap-x-2">
                <span className="nums text-ink-400">{row.account}</span>
                <span style={{ unicodeBidi: 'plaintext' }}>{row.names.join(' / ')}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title={t.payment.history} className="mt-4" bodyClassName="p-0">
        <HandoverList t={t} locale={locale} rows={handovers} />
      </Panel>
    </>
  );
}
