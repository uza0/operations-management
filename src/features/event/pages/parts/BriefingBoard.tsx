'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  markBriefedAction,
  resetBriefingsAction,
  sendBriefingsViaApiAction,
} from '@/server/actions/notify';
import { idle } from '@/server/actions/types';
import { Panel } from '@/components/ui/panel';
import { EmptyState, FormError, Notice } from '@/components/ui/states';
import { Badge } from '@/components/ui/status';
import { CopyButton, Dialog, DictionaryProvider, SubmitButton } from '@/components/ui/client';
import { IconAlert, IconCheckCircle, IconQr, IconUsers } from '@/components/ui/icons';
import { formatDateTime } from '@/lib/time';
import type { Dictionary } from '@/lib/i18n';
import type { WhatsAppStatus } from '@/server/services/whatsapp';

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
  api,
}: {
  t: Dictionary;
  locale: 'ar' | 'en';
  eventId: string;
  rows: BriefingRow[];
  hasLocation: boolean;
  /** Whether the official Cloud API is configured. Never carries the token. */
  api: WhatsAppStatus;
}) {
  const router = useRouter();
  const [state, action] = useActionState(markBriefedAction, idle);
  const [resetState, resetAction] = useActionState(resetBriefingsAction, idle);
  const [apiState, apiAction] = useActionState(sendBriefingsViaApiAction, idle);
  const [preview, setPreview] = useState<BriefingRow | null>(null);
  /*
   * The run: the queue of people still to tell, frozen when the run starts.
   *
   * Frozen deliberately. A browser blocks a window opened anywhere except
   * straight out of a click, so thirty chats cannot be opened at once and the
   * supervisor presses once per person anyway — but he should never have to
   * find the next person himself. Freezing the list means the order stays put
   * while rows re-render underneath, and the cursor is local so pressing again
   * never waits for the server.
   */
  const [run, setRun] = useState<BriefingRow[] | null>(null);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (
      state.status === 'success' ||
      resetState.status === 'success' ||
      apiState.status === 'success'
    ) {
      router.refresh();
    }
  }, [state, resetState, apiState, router]);

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

  /** Starts a run through everyone still waiting, in the order shown. */
  function startRun() {
    const queue = pending.filter((row) => row.whatsapp);
    if (queue.length === 0) return;
    setRun(queue);
    setCursor(0);
    send(queue[0]);
    // The first is already sent, so the bar should offer the second.
    setCursor(1);
  }

  function sendNextInRun() {
    if (!run) return;
    const row = run[cursor];
    if (!row) return;
    send(row);
    setCursor((n) => n + 1);
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
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" onClick={startRun}>
                  {t.notify.sendAll}
                </button>
                <button type="button" className="btn-secondary" onClick={() => send(next)}>
                  {t.notify.sendNext}
                </button>
              </div>
            ) : (
              <span className="inline-flex items-center gap-2 text-[13.5px] font-medium text-ok-text">
                <IconCheckCircle width={16} height={16} />
                {t.notify.allDone}
              </span>
            )}
          </div>

          {/*
            * The run bar. It stays put while the supervisor flicks between
            * WhatsApp and the browser, so coming back means pressing one
            * button in the same place rather than finding his position in a
            * list of ninety names.
            */}
          {run ? (
            <div className="mt-3 rounded-card border border-brand-500/40 bg-brand-500/10 p-3">
              {cursor < run.length ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="nums text-[12.5px] text-ink-400">
                      {cursor + 1} / {run.length}
                    </p>
                    <p
                      className="truncate text-[14.5px] font-semibold text-ink-100"
                      style={{ unicodeBidi: 'plaintext' }}
                    >
                      {run[cursor].name}
                      {run[cursor].place ? (
                        <span className="text-ink-400"> — {run[cursor].place}</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary" onClick={sendNextInRun}>
                      {t.notify.runNext}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => setRun(null)}
                    >
                      {t.notify.runStop}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-[13.5px] font-medium text-ok-text">
                    <IconCheckCircle width={16} height={16} />
                    {t.notify.runDone}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => setRun(null)}
                  >
                    {t.common.close}
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {/*
            * The official route. It is shown either way — connected, so the
            * supervisor knows the one-press option exists; or not connected,
            * so he knows what it would take rather than wondering why the
            * system cannot do it. The token itself never reaches this file:
            * only whether it is set, and which variable is missing.
            */}
          <div className="mt-3 rounded-card border border-ink-800 bg-ink-950/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-ink-100">{t.notify.apiTitle}</p>
                <p className="mt-0.5 text-[12px] leading-5 text-ink-500">
                  {api.configured ? t.notify.apiReady : t.notify.apiSetupHint}
                </p>
                {!api.configured && api.missing.length > 0 ? (
                  <p className="mt-1 text-[11.5px] text-ink-600" dir="ltr">
                    {t.notify.apiMissing}: {api.missing.join(', ')}
                  </p>
                ) : null}
              </div>

              {api.configured ? (
                <form action={apiAction}>
                  <input type="hidden" name="eventId" value={eventId} />
                  <SubmitButton
                    className="btn-primary btn-sm"
                    pendingLabel={t.notify.apiSending}
                    disabled={pending.length === 0}
                  >
                    {t.notify.apiSendAll}
                  </SubmitButton>
                </form>
              ) : null}
            </div>

            {apiState.status === 'error' ? (
              <p className="mt-2 text-[12.5px] leading-5 text-crit-text">{apiState.message}</p>
            ) : null}
            {apiState.status === 'success' && apiState.message ? (
              <p className="mt-2 text-[12.5px] text-ok-text">{apiState.message}</p>
            ) : null}
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
