'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Dialog } from '@/components/ui/client';
import { Notice } from '@/components/ui/states';
import { formatAmount } from '@/lib/money';
import { formatDate, formatDateTime } from '@/lib/time';
import type { Dictionary, Locale } from '@/lib/i18n';
import type { EventStatus } from '@/lib/constants';
import { idle } from '@/server/actions/types';
import {
  detachSeatPayAction,
  listSeatDetachCandidatesAction,
  undoSeatPayDetachAction,
} from '@/server/actions/payment-file';

type Candidate = {
  eventId: string;
  eventName: string;
  eventDate: string;
  eventStatus: string;
  days: { date: string; approvedWorkers: number; totalPay: number }[];
  totalPay: number;
};

type DetachedEvent = {
  eventId: string;
  eventName: string;
  eventDate: string;
  detachedAt: Date;
  detachedByName: string | null;
  reason: string;
  anyPaid: boolean;
  unpaidTotal: number;
  days: { date: string; approvedWorkers: number; unpaidWorkers: number; unpaidPay: number }[];
};

export function SeatPaySeparation({
  t,
  locale,
  range,
  detachedEvents,
}: {
  t: Dictionary;
  locale: Locale;
  range: { from: string; to: string };
  detachedEvents: DetachedEvent[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<'ok' | 'warn'>('warn');
  const [pending, startTransition] = useTransition();
  const [undoing, setUndoing] = useState<string | null>(null);
  const [undoMessage, setUndoMessage] = useState<string | null>(null);

  const search = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      try {
        setCandidates(await listSeatDetachCandidatesAction(from, to));
        setSearched(true);
        setSelected(null);
        setReason('');
      } catch {
        setMessage(t.errors.forbidden);
        setMessageTone('warn');
      }
    });
  };

  const detach = () => {
    if (!selected || reason.trim().length < 5) {
      setMessage(t.payment.detachReasonRequired);
      return;
    }
    const form = new FormData();
    form.set('eventId', selected);
    form.set('reason', reason);
    startTransition(async () => {
      const result = await detachSeatPayAction(idle, form);
      setMessage(result.status === 'idle' ? null : (result.message ?? null));
      setMessageTone(result.status === 'success' ? 'ok' : 'warn');
      if (result.status === 'success') {
        setCandidates((rows) => rows.filter((row) => row.eventId !== selected));
        setSelected(null);
        setReason('');
        router.refresh();
      }
    });
  };

  const undo = (eventId: string) => {
    setUndoing(eventId);
    setUndoMessage(null);
  };

  const confirmUndo = (eventId: string) => {
    const form = new FormData();
    form.set('eventId', eventId);
    startTransition(async () => {
      const result = await undoSeatPayDetachAction(idle, form);
      if (result.status === 'success') {
        setUndoing(null);
        router.refresh();
      } else {
        setUndoMessage(result.status === 'idle' ? null : (result.message ?? null));
      }
    });
  };

  return (
    <>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {t.payment.detachAction}
      </button>

      {detachedEvents.length ? (
        <section className="panel mt-4 p-4">
          <h2 className="text-[15px] font-semibold text-ink-100">{t.payment.detachHistory}</h2>
          <div className="mt-3 space-y-3">
            {detachedEvents.map((event) => (
              <article key={event.eventId} className="rounded-card border border-line-700 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-ink-100">{event.eventName}</div>
                    <div className="mt-1 text-[12.5px] text-ink-400">
                      {t.event.date}: {formatDate(event.eventDate, locale)} · {t.payment.detachBy}:{' '}
                      {event.detachedByName ?? '—'} · {formatDateTime(event.detachedAt, locale)}
                    </div>
                    <p className="mt-1 text-[12.5px] text-ink-300">{event.reason}</p>
                  </div>
                  <div className="text-end">
                    <div className="label">{t.payment.detachUnpaid}</div>
                    <div className="nums font-semibold text-ink-100">
                      {formatAmount(event.unpaidTotal)} {t.credit.currency}
                    </div>
                  </div>
                </div>
                <div className="mt-3 divide-y divide-line-800">
                  {event.days.map((day) => (
                    <div key={day.date} className="flex flex-wrap justify-between gap-2 py-2 text-[12.5px]">
                      <span className="text-ink-300">
                        {formatDate(day.date, locale)} · {day.approvedWorkers} {t.payment.detachApprovedWorkers}
                      </span>
                      <span className="nums text-ink-200">
                        {day.unpaidWorkers} {t.payment.detachUnpaidWorkers} · {formatAmount(day.unpaidPay)} {t.credit.currency}
                      </span>
                    </div>
                  ))}
                </div>
                {event.anyPaid ? (
                  <p className="mt-3 text-[12.5px] text-ink-500">{t.payment.detachUndoBlocked}</p>
                ) : (
                  <button type="button" className="btn-danger btn-sm mt-3" onClick={() => undo(event.eventId)}>
                    {t.payment.detachUndo}
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <Dialog
        open={open}
        onClose={close}
        title={t.payment.detachTitle}
        description={t.payment.detachDescription}
        wide
      >
        <form className="flex flex-wrap items-end gap-3" onSubmit={search}>
          <label className="block">
            <span className="label">{t.payment.detachFrom}</span>
            <input className="field nums" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
          </label>
          <label className="block">
            <span className="label">{t.payment.detachTo}</span>
            <input className="field nums" type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
          </label>
          <button className="btn-secondary btn-sm" type="submit" disabled={pending || to < from}>
            {pending ? t.common.loading : t.payment.detachSearch}
          </button>
        </form>

        {message ? <div className="mt-3"><Notice tone={messageTone}>{message}</Notice></div> : null}

        <div className="mt-4 space-y-3">
          {candidates.length === 0 && searched ? (
            <p className="text-[13px] leading-6 text-ink-400">{t.payment.detachNoCandidates}</p>
          ) : !searched ? null : candidates.map((event) => {
            const active = selected === event.eventId;
            return (
              <article key={event.eventId} className={`rounded-card border p-3 ${active ? 'border-brand-500' : 'border-line-700'}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-ink-100">{event.eventName}</h3>
                    <p className="mt-1 text-[12.5px] text-ink-400">
                      {t.event.date}: {formatDate(event.eventDate, locale)} · {t.common.status}:{' '}
                      {t.enums.eventStatus[event.eventStatus as EventStatus] ?? event.eventStatus}
                    </p>
                  </div>
                  <div className="text-end">
                    <div className="label">{t.payment.detachTotal}</div>
                    <div className="nums font-semibold text-ink-100">{formatAmount(event.totalPay)} {t.credit.currency}</div>
                  </div>
                </div>
                <div className="mt-2 divide-y divide-line-800">
                  {event.days.map((day) => (
                    <div key={day.date} className="flex flex-wrap justify-between gap-2 py-2 text-[12.5px]">
                      <span className="text-ink-300">{formatDate(day.date, locale)} · {day.approvedWorkers} {t.payment.detachApprovedWorkers}</span>
                      <span className="nums text-ink-200">{formatAmount(day.totalPay)} {t.credit.currency}</span>
                    </div>
                  ))}
                </div>
                <button type="button" className={active ? 'btn-primary btn-sm mt-3' : 'btn-secondary btn-sm mt-3'} onClick={() => {
                  setSelected(active ? null : event.eventId);
                  setReason('');
                  setMessage(null);
                }}>
                  {active ? t.common.cancel : t.payment.detachSelect}
                </button>
                {active ? (
                  <div className="mt-3 space-y-3">
                    <label className="block">
                      <span className="label">{t.payment.detachReason}</span>
                      <textarea className="field min-h-24 w-full" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.payment.detachReasonHint} required />
                    </label>
                    <button type="button" className="btn-primary" onClick={detach} disabled={pending || reason.trim().length < 5}>
                      {pending ? t.common.loading : t.payment.detachConfirm}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </Dialog>

      <Dialog
        open={undoing !== null}
        onClose={() => setUndoing(null)}
        title={t.payment.detachUndo}
        description={t.payment.detachUndoConfirm}
      >
        {undoMessage ? <Notice tone="warn">{undoMessage}</Notice> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setUndoing(null)}>{t.common.cancel}</button>
          <button type="button" className="btn-danger" disabled={pending || !undoing} onClick={() => undoing && confirmUndo(undoing)}>
            {pending ? t.common.loading : t.payment.detachUndo}
          </button>
        </div>
      </Dialog>
    </>
  );
}
