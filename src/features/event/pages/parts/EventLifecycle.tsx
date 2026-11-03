'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { changeEventStatusAction } from '@/server/actions/events';
import { idle } from '@/server/actions/types';
import { EVENT_STATUSES, EVENT_STATUS_FLOW, type EventStatus } from '@/lib/constants';
import { Badge, eventStatusTone } from '@/components/ui/status';
import { FormError, Notice } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import { IconArrowRight } from '@/components/ui/icons';
import type { Dictionary } from '@/lib/i18n';

/**
 * The lifecycle is visible, not hidden in a dropdown (spec §5): the current
 * stage is highlighted and only legal next stages are offered. Moving to READY
 * or LIVE while a gate is short comes back as a conflict the leader must
 * confirm deliberately.
 */
export function EventLifecycle({
  t,
  eventId,
  status,
}: {
  t: Dictionary;
  eventId: string;
  status: EventStatus;
}) {
  const router = useRouter();
  const [state, action] = useActionState(changeEventStatusAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  const next = EVENT_STATUS_FLOW[status] ?? [];
  const blocked = state.status === 'conflict';

  return (
    <div className="space-y-3.5">
      <ol className="flex flex-wrap items-center gap-1.5">
        {EVENT_STATUSES.filter((s) => s !== 'ARCHIVED').map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            {i > 0 ? (
              <IconArrowRight
                width={13}
                height={13}
                className="text-ink-600 rtl:rotate-180"
              />
            ) : null}
            <span className={s === status ? '' : 'opacity-45 grayscale'}>
              <Badge
                tone={eventStatusTone[s]}
                dot={s === status}
                pulse={s === 'LIVE' && s === status}
              >
                {t.enums.eventStatus[s]}
              </Badge>
            </span>
          </li>
        ))}
      </ol>

      {blocked ? <Notice tone="warn">{state.message}</Notice> : null}
      {state.status === 'error' ? <FormError message={state.message} /> : null}

      {next.length > 0 ? (
        <>
          <p className="text-[12.5px] text-ink-400">{t.event.advanceTo}</p>
          <div className="flex flex-wrap gap-2">
            {next.map((s) => (
              <form key={s} action={action}>
                <input type="hidden" name="eventId" value={eventId} />
                <input type="hidden" name="status" value={s} />
                {/* After a warning — short gates, or attendance nobody marked —
                    the same button is what confirms the move. */}
                {blocked ? <input type="hidden" name="force" value="true" /> : null}
                <SubmitButton
                  className={`btn-sm ${
                    s === 'ARCHIVED' || s === 'COMPLETED' ? 'btn-secondary' : 'btn-primary'
                  }`}
                  pendingLabel={t.common.saving}
                >
                  {blocked && (s === 'READY' || s === 'LIVE' || s === 'COMPLETED')
                    ? `${t.enums.eventStatus[s]} — ${t.common.confirm}`
                    : t.enums.eventStatus[s]}
                </SubmitButton>
              </form>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
