import { format, type Dictionary, type Locale } from '@/lib/i18n';
import { formatAmount } from '@/lib/money';
import { formatDate } from '@/lib/time';
import type { MemberLedger } from '@/server/services/credit';
import { IconChevron } from '@/components/ui/icons';
import { MoneyValue } from './MoneyVisibility';

/**
 * Where the figure above it came from.
 *
 * A promoter looking at ninety thousand for a night he knows pays thirty has
 * one question, and until now the only way to ask it was to ring the team
 * leader — who then had to open the system and read it back to him. The
 * answer is usually the chairs: two afternoons of setting out a hall, at
 * their own rate, on their own days, which is a different job from standing
 * at a gate and is paid as one.
 *
 * So each event is one line with its parts shown, never a merged total. The
 * merged total is exactly the number nobody can check.
 */
export function OwedLines({
  t,
  locale,
  ledger,
}: {
  t: Dictionary;
  locale: Locale;
  ledger: MemberLedger;
}) {
  const owed = ledger.lines.filter(
    (line) => line.closed && !line.paid && ((line.amount ?? 0) > 0 || (line.seatAmount ?? 0) > 0),
  );
  if (owed.length === 0) return null;

  return (
    <details className="owed-lines rounded-card border border-ink-700 bg-ink-850">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-ink-700 px-4 py-3">
        <span className="min-w-0">
          <span className="block text-[12.5px] font-semibold uppercase tracking-wide text-ink-500">
            {t.memberAuth.owedBreakdown}
          </span>
          <span className="mt-1 block text-[12px] leading-5 text-ink-500">
            {t.memberAuth.owedBreakdownHint}
          </span>
        </span>
        <IconChevron className="owed-lines-chevron shrink-0 text-ink-400" width={18} height={18} />
      </summary>

      <ul className="divide-y divide-ink-800">
        {owed.map((line) => {
          const fee = line.amount ?? 0;
          const chairs = line.seatAmount ?? 0;
          return (
            <li key={line.eventId} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[14px] font-semibold leading-6 text-ink-100"
                    style={{ unicodeBidi: 'plaintext' }}
                  >
                    {line.eventName}
                  </p>
                  <p className="nums mt-0.5 text-[12px] text-ink-500">
                    {formatDate(line.eventDate, locale)}
                  </p>
                </div>
                <p className="nums shrink-0 text-[15px] font-bold text-brand-300">
                  <MoneyValue value={`${formatAmount(fee + chairs)} ${t.credit.currency}`} />
                </p>
              </div>

              {/*
                The parts, and only when there is more than one. A single
                figure repeated under itself tells nobody anything.
              */}
              {chairs > 0 ? (
                <dl className="mt-2 space-y-1 border-t border-ink-800 pt-2 text-[12.5px]">
                  {fee > 0 ? (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-ink-400">{t.memberAuth.nightFee}</dt>
                      <dd className="nums text-ink-200">
                        <MoneyValue value={`${formatAmount(fee)} ${t.credit.currency}`} />
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-400">
                      {format(t.memberAuth.chairDays, { n: line.seatDays })}
                    </dt>
                    <dd className="nums text-ink-200">
                      <MoneyValue value={`${formatAmount(chairs)} ${t.credit.currency}`} />
                    </dd>
                  </div>
                </dl>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
