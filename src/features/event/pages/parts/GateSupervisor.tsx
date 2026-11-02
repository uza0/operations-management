'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { setGateSupervisorAction } from '@/server/actions/events';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import { IconTarget } from '@/components/ui/icons';
import type { Dictionary } from '@/lib/i18n';

/**
 * The account that supervises one gate.
 *
 * Read on the gate's own card and changed there, because the question comes
 * up while looking at the gates — "who is taking the north side tonight" — and
 * not while editing what the north side is.
 */
export function GateSupervisor({
  t,
  eventId,
  gateId,
  current,
  candidates,
}: {
  t: Dictionary;
  eventId: string;
  gateId: string;
  current: string | null;
  candidates: { id: string; name: string; label: string }[];
}) {
  const router = useRouter();
  const [state, action] = useActionState(setGateSupervisorAction, idle);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (state.status === 'success') {
      setEditing(false);
      router.refresh();
    }
  }, [state, router]);

  const currentName = candidates.find((c) => c.id === current)?.name ?? null;

  if (!editing) {
    return (
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-300">
          <IconTarget width={14} height={14} className="text-ink-500" />
          <span className="shrink-0">{t.event.gateLeader}:</span>
          {currentName ? (
            <span className="truncate font-medium">{currentName}</span>
          ) : (
            <span className="text-ink-500">{t.common.none}</span>
          )}
        </p>
        <button
          type="button"
          data-gate-supervisor={gateId}
          className="btn-ghost btn-sm"
          onClick={() => setEditing(true)}
        >
          {currentName ? t.common.edit : t.common.add}
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-3 space-y-2.5">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="gateId" value={gateId} />
      <select name="userId" className="field" defaultValue={current ?? ''} autoFocus>
        <option value="">{t.common.none}</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <p className="text-[12px] leading-5 text-ink-500">{t.event.gateLeaderHint}</p>
      <FormError message={state.status === 'error' ? state.message : null} />
      <div className="flex gap-2">
        <SubmitButton className="btn-primary btn-sm" pendingLabel={t.common.saving}>
          {t.common.save}
        </SubmitButton>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(false)}>
          {t.common.cancel}
        </button>
      </div>
    </form>
  );
}
