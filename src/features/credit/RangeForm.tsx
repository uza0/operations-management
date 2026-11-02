'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import type { Dictionary } from '@/lib/i18n';

/**
 * The period the report covers, and the two ways out of it: print, or hand the
 * accounts department a spreadsheet. Both buttons sit beside the dates because
 * whichever one you press, the period is the thing you had to get right first.
 */
export function RangeForm({
  base = '/admin',
  t,
  from,
  to,
  exportHref,
}: {
  base?: '/admin' | '/leader';
  t: Dictionary;
  from?: string;
  to?: string;
  exportHref: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [start, setStart] = useState(from ?? '');
  const [end, setEnd] = useState(to ?? '');

  function apply() {
    const next = new URLSearchParams(params.toString());
    if (start) next.set('from', start);
    else next.delete('from');
    if (end) next.set('to', end);
    else next.delete('to');
    router.push(next.size ? `${base}/credits?${next}` : `${base}/credits`);
  }

  return (
    <div className="panel no-print mb-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="label">{t.credit.from}</span>
          <input
            type="date"
            className="field nums"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">{t.credit.to}</span>
          <input
            type="date"
            className="field nums"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <button type="button" className="btn-primary btn-sm" onClick={apply}>
          {t.credit.apply}
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => {
            setStart('');
            setEnd('');
            router.push(`${base}/credits`);
          }}
        >
          {t.credit.allTime}
        </button>
        <span className="flex-1" />
        <a className="btn-ghost btn-sm" href={exportHref}>
          {t.credit.exportExcel}
        </a>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => window.print()}
        >
          {t.report.printReport}
        </button>
      </div>
    </div>
  );
}
