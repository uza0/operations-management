'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { removeExpenseAction, saveExpenseAction } from '@/server/actions/expenses';
import { idle } from '@/server/actions/types';
import { EmptyState, FormError, Notice } from '@/components/ui/states';
import { ConfirmSubmit, Dialog, SubmitButton } from '@/components/ui/client';
import { IconPlus } from '@/components/ui/icons';
import { Badge } from '@/components/ui/status';
import { formatAmount } from '@/lib/money';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/lib/constants';
import { format, type Dictionary, type Locale } from '@/lib/i18n';
import { formatDateTime } from '@/lib/time';
import type { EventExpenses, ExpenseLine } from '@/server/services/expenses';

/**
 * What the evening cost: a line each, a total, and a name on every line.
 *
 * The name is the point as much as the figure. These are sums somebody put
 * out of a pocket at nine at night, and a cost with nobody's name on it is
 * one that gets argued about a week later by people who are all sure it was
 * somebody else.
 */
export function ExpenseManager({
  t,
  locale,
  eventId,
  data,
}: {
  t: Dictionary;
  locale: Locale;
  eventId: string;
  data: EventExpenses;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ExpenseLine | 'new' | null>(null);

  const close = () => {
    setEditing(null);
    router.refresh();
  };

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-ink-800 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink-200">
            {format(t.expense.count, { n: data.lines.length })}
          </p>
          {/*
            Said on the screen and not only in a commit message: this money is
            the event's, not anybody's wage. Somebody reading a total of
            180,000 here has to know it is not owed to the team.
          */}
          <p className="mt-0.5 text-[12px] leading-5 text-ink-500">{t.expense.notPay}</p>
        </div>
        <p className="nums text-[13px] text-ink-300">
          {t.expense.total}: <span className="font-semibold">{formatAmount(data.total)}</span>{' '}
          {t.credit.currency}
        </p>
        <button
          type="button"
          className="btn-primary btn-sm w-full justify-center sm:w-auto"
          onClick={() => setEditing('new')}
        >
          <IconPlus width={15} height={15} />
          {t.expense.add}
        </button>
      </div>

      {data.byCategory.length > 1 ? (
        <div className="flex flex-wrap gap-2 border-b border-ink-800 px-4 py-3">
          {data.byCategory.map((row) => (
            <Badge key={row.category} tone="neutral">
              {t.enums.expenseCategory[row.category as ExpenseCategory]}
              <span className="nums"> · {formatAmount(row.amount)}</span>
            </Badge>
          ))}
        </div>
      ) : null}

      {data.lines.length === 0 ? (
        <EmptyState title={t.expense.empty} hint={t.expense.emptyHint} />
      ) : (
        <ul className="divide-y divide-ink-800">
          {data.lines.map((line) => (
            <ExpenseRow
              key={line.id}
              t={t}
              locale={locale}
              eventId={eventId}
              line={line}
              onEdit={() => setEditing(line)}
              onDone={close}
            />
          ))}
        </ul>
      )}

      {editing ? (
        <ExpenseDialog
          t={t}
          eventId={eventId}
          line={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={close}
        />
      ) : null}
    </>
  );
}

function ExpenseRow({
  t,
  locale,
  eventId,
  line,
  onEdit,
  onDone,
}: {
  t: Dictionary;
  locale: Locale;
  eventId: string;
  line: ExpenseLine;
  onEdit: () => void;
  onDone: () => void;
}) {
  const [state, remove] = useActionState(removeExpenseAction, idle);

  useEffect(() => {
    if (state.status === 'success') onDone();
  }, [state, onDone]);

  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold text-ink-100">{line.description}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-500">
          <span>{t.enums.expenseCategory[line.category as ExpenseCategory]}</span>
          <span aria-hidden className="text-ink-600">·</span>
          <span style={{ unicodeBidi: 'plaintext' }}>{line.createdByName}</span>
          <span aria-hidden className="text-ink-600">·</span>
          <span className="nums">{formatDateTime(line.createdAt, locale)}</span>
        </p>
      </div>

      <p className="nums shrink-0 text-[15px] font-bold text-ink-100">
        {formatAmount(line.amount)} {t.credit.currency}
      </p>

      <div className="flex shrink-0 items-center gap-2">
        <button type="button" className="btn-ghost btn-sm" onClick={onEdit}>
          {t.common.edit}
        </button>
        <form action={remove}>
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="id" value={line.id} />
          <ConfirmSubmit
            className="btn-ghost btn-sm text-crit-text"
            message={t.expense.removeConfirm}
          >
            {t.expense.remove}
          </ConfirmSubmit>
        </form>
      </div>
      {state.status === 'error' ? <FormError message={state.message} /> : null}
    </li>
  );
}

function ExpenseDialog({
  t,
  eventId,
  line,
  onClose,
  onDone,
}: {
  t: Dictionary;
  eventId: string;
  line: ExpenseLine | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [state, action] = useActionState(saveExpenseAction, idle);

  useEffect(() => {
    if (state.status === 'success') onDone();
  }, [state, onDone]);

  return (
    <Dialog open title={line ? t.expense.edit : t.expense.add} onClose={onClose}>
      <form action={action} className="space-y-3.5">
        <input type="hidden" name="eventId" value={eventId} />
        {line ? <input type="hidden" name="id" value={line.id} /> : null}

        <div>
          <label className="field-label" htmlFor="x-description">
            {t.expense.description}
          </label>
          <input
            id="x-description"
            name="description"
            className="field"
            required
            maxLength={200}
            placeholder={t.expense.descriptionPlaceholder}
            defaultValue={line?.description ?? ''}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="x-amount">
              {t.expense.amount}
            </label>
            <input
              id="x-amount"
              name="amount"
              className="field nums"
              required
              inputMode="numeric"
              defaultValue={line ? String(line.amount) : ''}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="x-category">
              {t.expense.category}
            </label>
            <select
              id="x-category"
              name="category"
              className="field"
              defaultValue={line?.category ?? 'OTHER'}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t.enums.expenseCategory[c]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Notice tone="info">{t.expense.notPay}</Notice>
        <FormError message={state.status === 'error' ? state.message : null} />

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t.common.cancel}
          </button>
          <SubmitButton className="btn-primary" pendingLabel={t.common.saving}>
            {t.common.save}
          </SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}
