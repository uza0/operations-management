import Link from 'next/link';

import { getT } from '@/lib/i18n/server';
import { formatAmount } from '@/lib/money';
import { format } from '@/lib/i18n';
import { formatDate } from '@/lib/time';
import { PageHeader, Panel } from '@/components/ui/panel';
import { EmptyState, Notice } from '@/components/ui/states';
import { listHandovers, oldestOwed } from '@/server/actions/payment-file';
import { detachedSeatEvents, previewExport } from '@/server/services/payment-file';

import { GenerateForm } from './GenerateForm';
import { HandoverList } from './HandoverList';
import { SeatPaySeparation } from './SeatPaySeparation';

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
  const [preview, handovers, oldest, detachedEvents] = await Promise.all([
    previewExport(range),
    listHandovers(),
    oldestOwed(),
    base === '/admin' ? detachedSeatEvents() : Promise.resolve([]),
  ]);

  const { bundle } = preview;
  const nothing = bundle.fees.length === 0 && bundle.costs.length === 0;

  return (
    <>
      <PageHeader
        title={t.payment.title}
        subtitle={t.payment.subtitle}
        action={
          /*
           * The roster check, reachable from here because here is where the
           * question comes up — and it is the one screen that finds the
           * person whose card was never registered before the week he works.
           */
          base === '/admin' ? (
            <Link href="/admin/payments/accounts" className="btn-ghost btn-sm">
              {t.accountCheck.nav}
            </Link>
          ) : undefined
        }
      />

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

      {base === '/admin' ? (
        <div className="mt-4">
          <SeatPaySeparation t={t} locale={locale} range={range} detachedEvents={detachedEvents} />
        </div>
      ) : null}

      {/*
        The period, spelled out on the panel that reports it. Without the
        dates here there was nothing on the screen to contradict two date
        boxes that had been typed into and not applied.
      */}
      <Panel
        title={`${t.payment.range}: ${range.from} → ${range.to}`}
        className="mt-4"
      >
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

      {preview.newcomers.length ? (
        <Panel title={t.payment.newcomersTitle} className="mt-4">
          <p className="mb-3 text-[12.5px] leading-6 text-ink-300">{t.payment.newcomersWhy}</p>
          <ul className="divide-y divide-line-800">
            {preview.newcomers.map((member) => (
              <li key={member.card} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div>
                  <div className="font-semibold text-ink-100">{member.name}</div>
                  {member.sharedNames.length ? (
                    <p className="mt-1 text-[12.5px] text-ink-300">
                      {format(t.payment.newcomerShared, { names: member.sharedNames.join('، ') })}
                    </p>
                  ) : null}
                </div>
                <div className="text-end">
                  <div className="nums font-semibold text-ink-100">{member.card}</div>
                  <div className="text-[11.5px] text-ink-400">{t.payment.newcomerAdded}</div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {base === '/admin' && bundle.fees.some((fee) => fee.detachedSeatPay) ? (
        <Panel title={t.payment.detachReview} className="mt-4">
          <div className="divide-y divide-line-800">
            {bundle.fees.filter((fee) => fee.detachedSeatPay).map((fee) => (
              <div key={fee.seatSetupMemberId ?? fee.eventMemberId} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div>
                  <div className="font-medium text-ink-100">{fee.memberName}</div>
                  <div className="text-[12.5px] text-ink-400">
                    {fee.eventName} · {formatDate(fee.date, locale)} · {fee.note}
                  </div>
                </div>
                <div className="nums font-semibold text-ink-100">
                  {formatAmount(fee.amount)} {t.credit.currency}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {/*
        Where the week's costs are going, said on the page that sends them.
        Without it the line simply appears in the file — a transfer in
        somebody's name that nothing on screen ever mentioned.
      */}
      {preview.looseCosts > 0 ? (
        <div className="mt-4">
          {preview.expenseAccount ? (
            <Notice tone="info">
              {t.payment.expenseAccountThis}:{' '}
              <span style={{ unicodeBidi: 'plaintext' }}>{preview.expenseAccount.name}</span>
              {' — '}
              <span className="nums">{formatAmount(preview.looseCosts)}</span>{' '}
              {t.credit.currency}
            </Notice>
          ) : (
            <Notice tone="warn">{t.payment.expenseAccountMissing}</Notice>
          )}
        </div>
      ) : null}

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
                      : b.kind === 'REGISTER_CONFLICT'
                        ? t.payment.registerConflict
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
                <span style={{ unicodeBidi: 'plaintext' }}>{row.names.join(' + ')}</span>
              </li>
            ))}
          </ul>
          {preview.warnings.length ? (
            <>
              <p className="mt-4 mb-2 text-[12.5px] leading-6 text-ink-400">
                {t.payment.nameGuessedWhy}
              </p>
              <ul className="space-y-1 text-[13.5px] text-ink-200">
                {preview.warnings.map((w) => (
                  <li key={w.label} style={{ unicodeBidi: 'plaintext' }}>
                    {w.label}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Panel>
      ) : null}

      {preview.bundle.unmarked.length ? (
        <Panel title={t.payment.unmarkedTitle} className="mt-4">
          <p className="mb-3 text-[12.5px] leading-6 text-ink-400">{t.payment.unmarkedWhy}</p>
          <ul className="space-y-1 text-[13.5px] text-ink-200">
            {preview.bundle.unmarked.map((row, i) => (
              <li key={`${row.eventName}-${row.memberName}-${i}`} style={{ unicodeBidi: 'plaintext' }}>
                {row.memberName} — <span className="text-ink-400">{row.eventName}</span>
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
