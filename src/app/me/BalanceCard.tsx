import { formatMoney } from '@/lib/money';
import type { MemberLedger } from '@/server/services/credit';
import type { Dictionary } from '@/lib/i18n';
import { MoneyValue, MoneyVisibilityToggle } from './MoneyVisibility';
import { IconWallet } from '@/components/ui/icons';

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
        <p className="text-[12.5px] font-semibold uppercase tracking-wide text-ink-500">
          {t.credit.title}
        </p>
        <p className="mt-2 text-[13.5px] leading-6 text-ink-300">
          {t.memberAuth.salariedNote}
        </p>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-card border border-ink-700 bg-ink-850 p-4">
      <div aria-hidden className="pointer-events-none absolute -top-16 h-40 w-40 rounded-full bg-brand-500/10 ltr:-right-12 rtl:-left-12" />
      <div className="relative flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-300">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-500/15 text-brand-300"><IconWallet width={16} height={16} /></span>
          {t.credit.title}
        </p>
        <MoneyVisibilityToggle showLabel={t.memberAuth.showMoney} hideLabel={t.memberAuth.hideMoney} />
      </div>

      <p className="nums relative mt-3 text-[32px] font-bold leading-10 text-brand-300">
        <MoneyValue value={formatMoney(ledger.totalAmount, locale)} />
      </p>
      <p className="text-[12.5px] text-ink-400">{t.memberAuth.owedNow}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-ink-800/70 px-3 py-2.5">
          <dt className="text-[12px] text-ink-500">{t.credit.pendingAmount}</dt>
          <dd className="nums mt-0.5 text-[15px] font-semibold text-ink-200">
            <MoneyValue value={formatMoney(ledger.pendingAmount, locale)} />
          </dd>
        </div>
        <div className="rounded-xl bg-ink-800/70 px-3 py-2.5">
          <dt className="text-[12px] text-ink-500">{t.memberAuth.received}</dt>
          <dd className="nums mt-0.5 text-[15px] font-semibold text-ink-200">
            <MoneyValue value={formatMoney(ledger.paidAmount, locale)} />
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-[12.5px] leading-5 text-ink-400">{t.memberAuth.balanceHint}</p>
    </section>
  );
}
