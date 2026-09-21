'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { saveReportNotesAction } from '@/server/actions/events';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import { IconPrint } from '@/components/ui/icons';
import type { Dictionary } from '@/lib/i18n';

export function PrintButton({ label, auto = false }: { label: string; auto?: boolean }) {
  /*
   * `auto` is how the board's "Export PDF" button works: it opens this page
   * with ?print=1 and the print dialog comes up by itself, so exporting is one
   * click from the board rather than two pages and a menu. The browser's own
   * "Save as PDF" writes the file — which is also what produces correct Arabic,
   * something no PDF we could assemble ourselves would manage as well.
   */
  useEffect(() => {
    if (!auto) return;
    // One frame after paint: printing a half-laid-out page prints a half page.
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [auto]);

  return (
    <button type="button" className="btn-secondary no-print" onClick={() => window.print()}>
      <IconPrint width={16} height={16} />
      {label}
    </button>
  );
}

export function ReportNotes({
  t,
  eventId,
  value,
  canManage,
}: {
  t: Dictionary;
  eventId: string;
  value: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [state, action] = useActionState(saveReportNotesAction, idle);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (state.status === 'success') {
      setSaved(true);
      router.refresh();
      const timer = setTimeout(() => setSaved(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [state, router]);

  if (!canManage) {
    return (
      <p className="whitespace-pre-line text-[13.5px] leading-6 text-ink-300 print-text">
        {value || '—'}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="eventId" value={eventId} />
      <textarea
        name="reportNotes"
        rows={4}
        className="field print-text"
        defaultValue={value ?? ''}
        placeholder={t.report.operationalNotes}
      />
      {state.status === 'error' ? <FormError message={state.message} /> : null}
      <div className="flex items-center justify-end gap-3 no-print">
        {saved ? <span className="text-[12.5px] text-ok-text">{t.common.copied}</span> : null}
        <SubmitButton className="btn-secondary btn-sm" pendingLabel={t.common.saving}>
          {t.report.saveNotes}
        </SubmitButton>
      </div>
    </form>
  );
}
