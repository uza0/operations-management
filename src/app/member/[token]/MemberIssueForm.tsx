'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { memberReportIssueAction } from '@/server/actions/member';
import { idle } from '@/server/actions/types';
import { FormError, Notice } from '@/components/ui/states';
import { IconAlert, IconClose } from '@/components/ui/icons';
import {
  ISSUE_PRIORITIES,
  ISSUE_TYPES,
  type IssuePriority,
  type IssueType,
} from '@/lib/constants';
import { format, type Dictionary } from '@/lib/i18n';
import {
  enqueue,
  flush,
  listQueued,
  newClientId,
  type QueuedReport,
} from '@/lib/offline-queue';

/**
 * Reporting a problem from a place with no signal.
 *
 * The order is the whole point: the report is written to the phone first and
 * sent second. That is the difference between a promoter who reports the next
 * problem too and one who goes back to the WhatsApp group — a tap that appears
 * to do nothing is indistinguishable from a tap that did nothing.
 *
 * So this is not a plain server-action form any more. It stores, then sends,
 * then says which of the two happened, honestly: "sent" means the server has
 * it, "saved on your phone" means it does not yet. Nothing here ever claims a
 * report reached the operations board when it did not.
 */
export function MemberIssueForm({ t, token }: { t: Dictionary; token: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentNow, setSentNow] = useState(false);
  const [savedLocally, setSavedLocally] = useState(false);
  const [queued, setQueued] = useState(0);
  const [online, setOnline] = useState(true);

  /** One queued report, handed to the server. */
  const send = useCallback(async (report: QueuedReport) => {
    const body = new FormData();
    body.set('token', report.token);
    body.set('clientId', report.clientId);
    body.set('type', report.type);
    body.set('priority', report.priority);
    body.set('description', report.description);
    const result = await memberReportIssueAction(idle, body);
    return {
      ok: result.status === 'success',
      message: result.status === 'error' ? result.message : undefined,
    };
  }, []);

  const drain = useCallback(async () => {
    const { sent, left } = await flush(send);
    setQueued(left);
    if (sent > 0) router.refresh();
  }, [send, router]);

  /*
   * Drain on arrival and whenever the network comes back. A promoter who
   * reported something in the concourse and walks past a working access point
   * should not have to do anything for it to arrive.
   */
  useEffect(() => {
    setOnline(navigator.onLine);
    void listQueued().then((rows) => setQueued(rows.length));
    void drain();

    const back = () => {
      setOnline(true);
      void drain();
    };
    const gone = () => setOnline(false);
    window.addEventListener('online', back);
    window.addEventListener('offline', gone);
    return () => {
      window.removeEventListener('online', back);
      window.removeEventListener('offline', gone);
    };
  }, [drain]);

  async function onSubmit(formData: FormData) {
    setBusy(true);
    setError(null);
    setSentNow(false);
    setSavedLocally(false);

    const report: QueuedReport = {
      clientId: newClientId(),
      token,
      type: String(formData.get('type') ?? 'OTHER'),
      priority: String(formData.get('priority') ?? 'MEDIUM'),
      description: String(formData.get('description') ?? '').trim(),
      createdAt: Date.now(),
      attempts: 0,
    };

    if (!report.description) {
      setBusy(false);
      setError(t.errors.required);
      return;
    }

    // Stored first. If storage is unavailable the send below is still tried —
    // no worse than before, and the person is told the truth either way.
    const stored = await enqueue(report);

    let delivered = false;
    try {
      delivered = (await send(report)).ok;
    } catch {
      delivered = false;
    }

    if (delivered) {
      if (stored) await flush(send);
      setSentNow(true);
      setOpen(false);
      router.refresh();
    } else if (stored) {
      setSavedLocally(true);
      setOpen(false);
    } else {
      setError(t.errors.generic);
    }

    setQueued((await listQueued()).length);
    setBusy(false);
  }

  if (!open) {
    return (
      <div className="space-y-2">
        {sentNow ? (
          <Notice tone="ok">
            <span className="font-semibold">{t.member.issueSent}</span> —{' '}
            {t.member.issueSentHint}
          </Notice>
        ) : null}

        {savedLocally ? (
          <Notice tone="warn">{t.member.offlineSaved}</Notice>
        ) : null}

        {/*
          The state of the outbox, stated plainly. A promoter does not need to
          know what IndexedDB is; they need to know whether the thing they just
          reported has actually left the phone.
        */}
        {queued > 0 || !online ? (
          <p className="flex items-center gap-2 px-1 text-[12.5px] text-ink-400">
            <span
              aria-hidden
              className={`h-2 w-2 shrink-0 rounded-full ${
                online ? 'bg-ok' : 'bg-warn animate-pulseSoft'
              }`}
            />
            <span>{online ? t.member.online : t.member.offline}</span>
            {queued > 0 ? (
              <>
                <span aria-hidden className="text-ink-600">
                  ·
                </span>
                {/*
                  The count is isolated. Left to flow, the separator and a
                  single digit sit against each other in an RTL line and read
                  as one number — "· 1" becomes "10", which is the difference
                  between one report waiting and ten.
                */}
                <span className="nums">{format(t.member.pendingSend, { n: queued })}</span>
              </>
            ) : null}
          </p>
        ) : null}

        <button
          type="button"
          className="btn-secondary w-full justify-center py-3.5 text-[15px]"
          onClick={() => setOpen(true)}
        >
          <IconAlert width={18} height={18} />
          {t.member.reportIssue}
        </button>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="panel space-y-3.5 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[14.5px] font-semibold text-ink-100">{t.issue.reportIssue}</p>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => setOpen(false)}
          aria-label={t.common.close}
        >
          <IconClose width={17} height={17} />
        </button>
      </div>

      <div>
        <label className="field-label" htmlFor="m-type">
          {t.issue.issueType}
        </label>
        <select id="m-type" name="type" className="field" defaultValue="SCANNER">
          {/* Emergencies have their own button; this list is for the rest. */}
          {ISSUE_TYPES.filter((type) => type !== 'EMERGENCY').map((type) => (
            <option key={type} value={type}>
              {t.enums.issueType[type as IssueType]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="field-label" htmlFor="m-priority">
          {t.issue.priority}
        </label>
        <select id="m-priority" name="priority" className="field" defaultValue="MEDIUM">
          {ISSUE_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {t.enums.issuePriority[p as IssuePriority]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="field-label" htmlFor="m-description">
          {t.common.description}
        </label>
        <textarea
          id="m-description"
          name="description"
          rows={4}
          className="field"
          required
          placeholder={t.issue.describeHint}
        />
      </div>

      {error ? <FormError message={error} /> : null}

      <button type="submit" className="btn-primary w-full py-3.5" disabled={busy}>
        {busy ? t.common.saving : t.member.reportIssue}
      </button>
    </form>
  );
}
