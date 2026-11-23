'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { reconcileLegacyChairPaymentsAction } from '@/server/actions/payment-file';
import { idle } from '@/server/actions/types';
import { FormError, Notice } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import { formatAmount } from '@/lib/money';
import type { Dictionary, Locale } from '@/lib/i18n';

export function LegacyChairRepair({ t, locale, preview }: {
  t: Dictionary; locale: Locale; preview: { count: number; total: number; unmatched: number };
}) {
  const [state, action] = useActionState(reconcileLegacyChairPaymentsAction, idle);
  const router = useRouter();
  useEffect(() => { if (state.status === 'success') router.refresh(); }, [state, router]);
  return <form action={action} className="space-y-3">
    <p className="text-sm text-ink-300">{t.payment.legacyChairHint}</p>
    <p className="nums">{preview.count} · {formatAmount(preview.total)}</p>
    {preview.unmatched > 0 ? <Notice tone="warn">{t.payment.legacyChairUnmatched} ({preview.unmatched})</Notice> : null}
    {state.status === 'success' ? <Notice tone="ok">{state.message}</Notice> : null}
    <FormError message={state.status === 'error' ? state.message : null} />
    {preview.count > 0 ? <SubmitButton className="btn-primary btn-sm" pendingLabel={t.common.saving}>
      {t.payment.legacyChairRepair}
    </SubmitButton> : <p className="text-sm text-ink-500">{t.payment.legacyChairClean}</p>}
  </form>;
}
