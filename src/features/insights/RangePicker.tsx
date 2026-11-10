'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import type { Dictionary } from '@/lib/i18n';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The two dates, applying themselves.
 *
 * Same rule as the payment file: a box that says one period while the figures
 * under it describe another is a screen telling the reader two things at
 * once, and the reader believes the boxes.
 */
export function RangePicker({
  t,
  range,
  path,
}: {
  t: Dictionary;
  range: { from: string; to: string };
  /** Where the dates are applied — the stats screen or the printable one. */
  path: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);

  const apply = (nextFrom: string, nextTo: string) => {
    if (!DATE.test(nextFrom) || !DATE.test(nextTo)) return;
    if (nextFrom === range.from && nextTo === range.to) return;
    const next = new URLSearchParams(params.toString());
    next.set('from', nextFrom);
    next.set('to', nextTo);
    router.push(`${path}?${next}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="label">{t.insights.from}</span>
        <input
          type="date"
          className="field nums"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            apply(e.target.value, to);
          }}
        />
      </label>
      <label className="block">
        <span className="label">{t.insights.to}</span>
        <input
          type="date"
          className="field nums"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            apply(from, e.target.value);
          }}
        />
      </label>
    </div>
  );
}
