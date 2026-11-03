'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { uploadTemplateAction } from '@/server/actions/payment-file';
import { idle } from '@/server/actions/types';
import { FormError, Notice } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import { formatDateTime } from '@/lib/time';
import type { Dictionary, Locale } from '@/lib/i18n';

/**
 * The company's own workbook, stored as the thing we fill.
 *
 * Their form rather than one of ours, because it carries their checks tab:
 * our figures get examined by their rules before anybody moves money. That is
 * what makes the file trustworthy to them, and it is worth more than any
 * export we could design.
 */
export function TemplateForm({
  t,
  locale,
  current,
}: {
  t: Dictionary;
  locale: Locale;
  current: { fileName: string; uploadedByName: string; createdAt: Date } | null;
}) {
  const router = useRouter();
  const [state, action] = useActionState(uploadTemplateAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-3">
      {current ? (
        <p className="text-[13px] text-ink-300">
          <span className="font-semibold" style={{ unicodeBidi: 'plaintext' }}>
            {current.fileName}
          </span>
          <span className="text-ink-500">
            {' — '}
            {t.payment.templateBy} {current.uploadedByName}
            {' · '}
            <span className="nums">{formatDateTime(current.createdAt, locale)}</span>
          </span>
        </p>
      ) : (
        <Notice tone="warn">{t.payment.templateNone}</Notice>
      )}

      <input
        type="file"
        name="file"
        accept=".xlsx"
        required
        className="field file:me-3 file:rounded file:border-0 file:bg-ink-800 file:px-3 file:py-1.5 file:text-ink-200"
      />

      <p className="text-[12px] leading-5 text-ink-500">{t.payment.repairedWhy}</p>

      {state.status === 'success' ? <Notice tone="ok">{state.message}</Notice> : null}
      <FormError message={state.status === 'error' ? state.message : null} />

      <SubmitButton className="btn-primary btn-sm" pendingLabel={t.common.saving}>
        {t.payment.templateUpload}
      </SubmitButton>
    </form>
  );
}
