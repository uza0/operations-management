'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { markBriefedAction, resetBriefingsAction } from '@/server/actions/notify';
import { idle } from '@/server/actions/types';
import { Panel } from '@/components/ui/panel';
import { EmptyState, FormError, Notice } from '@/components/ui/states';
import { Badge } from '@/components/ui/status';
import { CopyButton, Dialog, DictionaryProvider } from '@/components/ui/client';
import { IconAlert, IconCheckCircle, IconQr, IconUsers } from '@/components/ui/icons';
import { formatDateTime } from '@/lib/time';
import type { Dictionary } from '@/lib/i18n';

export type BriefingRow = {
  eventMemberId: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  place: string | null;
  task: string | null;
  isReserve: boolean;
  assigned: boolean;
  stale: boolean;
  notifiedAtLabel: string | null;
  memberUrl: string;
  message: string;
  qrDataUrl: string | null;
};

/** wa.me carries the text into the chat; the organiser still presses send. */
function waLink(number: string, message: string) {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function BriefingBoard({
  t,
  locale,
  eventId,
  rows,
  hasLocation,
}: {
  t: Dictionary;
  locale: 'ar' | 'en';
  eventId: string;
  rows: BriefingRow[];
  hasLocation: boolean;
}) {
  const router = useRouter();
  const [state, action] = useActionState(markBriefedAction, idle);
  const [resetState, resetAction] = useActionState(resetBriefingsAction, idle);
  const [preview, setPreview] = useState<BriefingRow | null>(null);

  useEffect(() => {
    if (state.status === 'success' || resetState.status === 'success') router.refresh();
  }, [state, resetState, router]);

  const pending = useMemo(
    () => rows.filter((r) => r.whatsapp && (!r.notifiedAtLabel || r.stale)),
    [rows],
  );
  const next = pending[0] ?? null;
  const withoutPhone = rows.filter((r) => !r.whatsapp);

  /**
   * One member: open their chat with the message written, and record it.
   *
   * The window is opened before the server action so the browser still counts
   * it as a direct result of the click — a popup opened after an await is
   * blocked, which on a phone looks like the button simply doing nothing.
   */
  function send(row: BriefingRow) {
    if (!row.whatsapp) return;
    window.open(waLink(row.whatsapp, row.message), '_blank', 'noopener,noreferrer');
    const form = new FormData();
    form.set('eventId', eventId);
    form.append('eventMemberIds', row.eventMemberId);
    action(form);
  }

  if (rows.length === 0) {
    return (
      <Panel bodyClassName="p-0">
        <EmptyState
          title={t.notify.empty}
          hint={t.notify.emptyHint}
          icon={<IconUsers width={20} height={20} />}
        />
      </Panel>
    );
  }

  return (
    <DictionaryProvider dict={t}>
      <div className="space-y-4">
        {!hasLocation ? (
          <Notice tone="warn">{t.notify.noLocationWarning}</Notice>
        ) : null}

        {/* The one control that matters when there are thirty people to tell. */}
        <div className="panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] text-ink-400">
                {t.notify.remaining}:{' '}
                <span className="nums text-[16px] font-bold text-ink-100">
                  {pending.length}
                </span>
                <span className="text-ink-500"> / {rows.length}</span>
              </p>
              {next ? (
                <p className="mt-0.5 truncate text-[12.5px] text-ink-500">
                  {next.name}
                  {next.place ? ` — ${next.place}` : ''}
                </p>
              ) : null}
            </div>

            {next ? (
              <button type="button" className="btn-primary" onClick={() => send(next)}>
                {t.notify.sendNext}
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 text-[13.5px] font-medium text-ok-text">
                <IconCheckCircle width={16} height={16} />
                {t.notify.allDone}
              </span>
            )}
          </div>

          <p className="mt-3 border-t border-ink-800 pt-3 text-[12px] leading-relaxed text-ink-500">
            {t.notify.howItWorks}
          </p>

          {withoutPhone.length > 0 ? (
            <p className="mt-2 text-[12px] text-warn-text">
              {t.notify.noPhone}: <span className="nums">{withoutPhone.length}</span> —{' '}
              {t.notify.noPhoneHint}
            </p>
          ) : null}

          <FormError message={state.status === 'error' ? state.message : null} />
        </div>

        {/* Per-member rows -------------------------------------------------- */}
        <Panel title={t.eventTeam.title} bodyClassName="p-0">
          <table className="op-table op-table-stack">
            <thead>
              <tr>
                <th>{t.team.fullName}</th>
                <th>{t.assignment.location}</th>
                <th>{t.assignment.task}</th>
                <th>{t.common.status}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.eventMemberId}>
                  <td data-label={t.team.fullName}>
                    <span className="font-medium text-ink-100">{row.name}</span>
                    {row.phone ? (
                      <span className="nums ms-2 text-[12px] text-ink-500" dir="ltr">
                        {row.phone}
                      </span>
                    ) : null}
                  </td>
                  <td data-label={t.assignment.location}>
                    {row.place ?? (
                      <Badge tone="neutral">{t.notify.reserveTag}</Badge>
                    )}
                  </td>
                  <td data-label={t.assignment.task}>{row.task ?? '—'}</td>
                  <td data-label={t.common.status}>
                    {!row.whatsapp ? (
                      <Badge tone="warn">{t.notify.noPhone}</Badge>
                    ) : row.stale ? (
                      <Badge tone="crit">
                        <IconAlert width={13} height={13} />
                        {t.notify.stale}
                      </Badge>
                    ) : row.notifiedAtLabel ? (
                      <span className="text-[12px] text-ok-text">
                        {t.notify.notifiedAt} ·{' '}
                        <span className="nums">
                          {formatDateTime(new Date(row.notifiedAtLabel), locale)}
                        </span>
                      </span>
                    ) : (
                      <Badge tone="neutral">{t.notify.notNotified}</Badge>
                    )}
                  </td>
                  <td data-label="">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        disabled={!row.whatsapp}
                        onClick={() => send(row)}
                      >
                        {row.notifiedAtLabel ? t.notify.resend : t.notify.sendWhatsApp}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => setPreview(row)}
                      >
                        <IconQr width={15} height={15} />
                        {t.notify.preview}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <form action={resetAction} className="flex justify-end">
          <input type="hidden" name="eventId" value={eventId} />
          <button type="submit" className="btn-ghost btn-sm">
            {t.common.reset}
          </button>
        </form>
      </div>

      <Dialog
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.name ?? ''}
        description={preview?.place ?? undefined}
      >
        {preview ? (
          <div className="space-y-4">
            <pre className="whitespace-pre-wrap rounded-lg border border-ink-700 bg-ink-950 p-3 text-[13px] leading-relaxed text-ink-200 [overflow-wrap:anywhere]">
              {preview.message}
            </pre>

            {preview.qrDataUrl ? (
              <div className="flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.qrDataUrl}
                  alt={preview.name}
                  className="h-44 w-44 rounded-lg bg-white p-2"
                />
                <p className="text-[12px] text-ink-500">{t.eventTeam.qrHint}</p>
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <CopyButton
                value={preview.message}
                label={t.notify.copy}
                copiedLabel={t.common.copied}
              />
              <button
                type="button"
                className="btn-primary btn-sm"
                disabled={!preview.whatsapp}
                onClick={() => {
                  send(preview);
                  setPreview(null);
                }}
              >
                {t.notify.sendWhatsApp}
              </button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </DictionaryProvider>
  );
}
