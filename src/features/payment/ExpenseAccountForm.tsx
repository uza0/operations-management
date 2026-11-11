'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { setExpenseAccountAction } from '@/server/actions/payment-file';
import { idle } from '@/server/actions/types';
import { FormError, Notice } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import type { Dictionary } from '@/lib/i18n';

/**
 * Who the week's event costs come back to.
 *
 * A standing choice, set once. The leader pays for the scanner credit out of
 * his own pocket on the night and the company returns it in one transfer; up
 * to now he wrote that line into the file by hand after every export, which
 * is a line about his own money typed by the man it pays.
 */
export function ExpenseAccountForm({
  t,
  members,
  currentId,
}: {
  t: Dictionary;
  members: { id: string; name: string; card: string | null }[];
  currentId: string | null;
}) {
  const router = useRouter();
  const [state, action] = useActionState(setExpenseAccountAction, idle);
  const [value, setValue] = useState(currentId ?? '');

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-3">
      <p className="text-[12.5px] leading-6 text-ink-400">{t.payment.expenseAccountWhy}</p>

      <label className="block">
        <span className="label">{t.payment.expenseAccount}</span>
        <select
          name="memberId"
          className="field"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        >
          <option value="">{t.payment.expenseAccountPick}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.card ? ` — ${m.card}` : ` — ${t.payment.expenseAccountNoCard}`}
            </option>
          ))}
        </select>
      </label>

      {!value ? <Notice tone="info">{t.payment.expenseAccountNone}</Notice> : null}

      <SubmitButton>{t.common.save}</SubmitButton>

      {state.status === 'error' ? <FormError message={state.message} /> : null}
      {state.status === 'success' ? (
        <Notice tone="ok">{t.payment.expenseAccountSaved}</Notice>
      ) : null}
    </form>
  );
}
