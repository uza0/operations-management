import { formatMoney } from '@/lib/money';
import type { MemberLedger } from '@/server/services/credit';
import type { Dictionary } from '@/lib/i18n';

/**
 * What he is owed, on his own page.
 *
 * Three figures and not one, because a single number cannot answer the two
 * questions he actually has. "مستحق الآن" is finished work nobody has handed
 * over yet — the figure he is waiting for. "قيد الاحتساب" is events still
 * running, which is why it is not in the first number and why asking for it
 * now is asking early. "استلمت" is what has already gone out, kept visible so
 * that a balance dropping to zero on payday reads as settled rather than lost.
 *
 * Someone on a monthly contract sees no figures at all. A zero beside his name
 * reads as an unpaid debt; the sentence says the truth instead.
 */
export function BalanceCard({
  t,
  locale,
  ledger,
  salaried,
}: {
  t: Dictionary;
  locale: string;
  ledger: MemberLedger;
  salaried: boolean;
}) {
  if (salaried) {
    return (
      <section className="rounded-card border border-ink-700 bg-ink-850 p-4">
        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-500">
          {t.credit.title}
        </p>
        <p className="mt-2 text-[13.5px] leading-6 text-ink-300">
          {t.memberAuth.salariedNote}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-card border border-ink-700 bg-ink-850 p-4">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-500">
        {t.credit.title}
      </p>

      <p className="nums mt-2 text-[30px] font-bold leading-10 text-brand-300">
        {formatMoney(ledger.totalAmount, locale)}
      </p>
      <p className="text-[12.5px] text-ink-400">{t.memberAuth.owedNow}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-700 pt-3">
        <div>
          <dt className="text-[11.5px] text-ink-500">{t.credit.pendingAmount}</dt>
          <dd className="nums mt-0.5 text-[15px] font-semibold text-ink-200">
            {formatMoney(ledger.pendingAmount, locale)}
          </dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-ink-500">{t.memberAuth.received}</dt>
          <dd className="nums mt-0.5 text-[15px] font-semibold text-ink-200">
            {formatMoney(ledger.paidAmount, locale)}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-[12px] leading-5 text-ink-500">{t.memberAuth.balanceHint}</p>
    </section>
  );
}
