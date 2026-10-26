'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { approveArrivalsAction } from '@/server/actions/journey';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import { format, type Dictionary, type Locale } from '@/lib/i18n';
import { plural } from '@/lib/plural';
import { formatTime } from '@/lib/time';
import type { ArrivalRow } from '@/server/services/journey';

/**
 * Event day, at the top of the attendance screen: the people who say they are
 * here, waiting for somebody who can see them to agree.
 *
 * Ticked rather than tapped one at a time, because at five o'clock there are
 * forty of them — but ticked, not assumed. A single "mark everyone present"
 * is how a man who never came is paid, so the list arrives with nothing
 * selected and the supervisor chooses.
 */
export function ArrivalApprovals({
  t,
  locale,
  eventId,
  pending,
  dueAt,
}: {
  t: Dictionary;
  locale: Locale;
  eventId: string;
  pending: ArrivalRow[];
  dueAt: string;
}) {
  const router = useRouter();
  const [state, action] = useActionState(approveArrivalsAction, idle);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (state.status === 'success') {
      setPicked(new Set());
      router.refresh();
    }
  }, [state, router]);

  if (pending.length === 0) return null;

  const all = picked.size === pending.length;

  return (
    <section className="panel mb-4 border-warn/40 bg-warn/5 p-0">
      <header className="flex flex-wrap items-center gap-3 border-b border-ink-800 px-4 py-3">
        <h2 className="text-[14.5px] font-bold text-ink-100">
          {t.journey.approveTitle}
          <span className="nums ms-2 font-normal text-ink-400">{pending.length}</span>
        </h2>
        <p className="nums ms-auto text-[12.5px] text-ink-500">
          {t.journey.dueAt} {formatTime(dueAt, locale)}
        </p>
      </header>

      <form action={action}>
        <input type="hidden" name="eventId" value={eventId} />

        <label className="press flex min-h-[44px] items-center gap-2.5 border-b border-ink-800 px-4 text-[13px] font-semibold text-ink-200">
          <input
            type="checkbox"
            className="h-4.5 w-4.5 accent-brand-500"
            checked={all}
            ref={(el) => {
              if (el) el.indeterminate = picked.size > 0 && !all;
            }}
            onChange={(e) =>
              setPicked(
                e.target.checked ? new Set(pending.map((p) => p.eventMemberId)) : new Set(),
              )
            }
          />
          {t.board.selectAll}
        </label>

        <ul className="divide-y divide-ink-800">
          {pending.map((row) => (
            <li key={row.eventMemberId}>
              <label className="flex min-h-[56px] items-center gap-3 px-4 py-2.5">
                <input
                  type="checkbox"
                  name="eventMemberId"
                  value={row.eventMemberId}
                  checked={picked.has(row.eventMemberId)}
                  onChange={(e) =>
                    setPicked((cur) => {
                      const next = new Set(cur);
                      if (e.target.checked) next.add(row.eventMemberId);
                      else next.delete(row.eventMemberId);
                      return next;
                    })
                  }
                  className="h-4.5 w-4.5 accent-brand-500"
                />
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-[14px] font-medium text-ink-100"
                    style={{ unicodeBidi: 'plaintext' }}
                  >
                    {row.name}
                  </span>
                  <span className="nums block text-[12px] text-ink-500">
                    {t.journey.reportedAt} {formatTime(row.checkInTime ?? '', locale)}
                    {row.minutesOff !== null ? (
                      <span
                        className={
                          row.minutesOff > 0 ? 'ms-1.5 text-warn-text' : 'ms-1.5 text-ok-text'
                        }
                      >
                        {format(
                          row.minutesOff > 0 ? t.journey.late : t.journey.early,
                          {
                            time: plural(
                              t.member.spanMinutes,
                              Math.abs(row.minutesOff),
                              locale,
                            ),
                          },
                        )}
                      </span>
                    ) : null}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3 border-t border-ink-800 px-4 py-3">
          <FormError message={state.status === 'error' ? state.message : null} />
          <span className="ms-auto">
            <SubmitButton className="btn-primary btn-sm" disabled={picked.size === 0}>
              {format(t.board.selectedCount, { n: picked.size })} · {t.journey.approve}
            </SubmitButton>
          </span>
        </div>
      </form>
    </section>
  );
}
