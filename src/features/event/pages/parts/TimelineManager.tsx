'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  deleteTimelineItemAction,
  saveTimelineItemAction,
} from '@/server/actions/operations';
import { idle } from '@/server/actions/types';
import { EmptyState, FormError } from '@/components/ui/states';
import { Badge, timelineTone } from '@/components/ui/status';
import { ConfirmSubmit, Dialog, SubmitButton } from '@/components/ui/client';
import { IconClock, IconEdit, IconPlus } from '@/components/ui/icons';
import { TIMELINE_STATUSES, type TimelineStatus } from '@/lib/constants';
import { formatTime } from '@/lib/time';
import type { Dictionary } from '@/lib/i18n';

export type TimelineRow = {
  id: string;
  title: string;
  description: string | null;
  scheduledTime: string;
  status: string;
};

function ItemForm({
  t,
  eventId,
  item,
  onDone,
}: {
  t: Dictionary;
  eventId: string;
  item?: TimelineRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState(saveTimelineItemAction, idle);

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      {item ? <input type="hidden" name="itemId" value={item.id} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_140px]">
        <div>
          <label className="field-label" htmlFor="tl-title">
            {t.timeline.itemTitle}
          </label>
          <input
            id="tl-title"
            name="title"
            className="field"
            required
            defaultValue={item?.title ?? ''}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="tl-time">
            {t.timeline.scheduledTime}
          </label>
          <input
            id="tl-time"
            name="scheduledTime"
            type="time"
            className="field nums"
            required
            defaultValue={item?.scheduledTime ?? '17:00'}
          />
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="tl-status">
          {t.common.status}
        </label>
        <select
          id="tl-status"
          name="status"
          className="field"
          defaultValue={item?.status ?? 'UPCOMING'}
        >
          {TIMELINE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t.enums.timelineStatus[status as TimelineStatus]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="field-label" htmlFor="tl-description">
          {t.common.description} <span className="text-ink-500">({t.common.optional})</span>
        </label>
        <textarea
          id="tl-description"
          name="description"
          rows={2}
          className="field"
          defaultValue={item?.description ?? ''}
        />
      </div>

      {state.status === 'error' ? <FormError message={state.message} /> : null}

      <div className="flex justify-end">
        <SubmitButton pendingLabel={t.common.saving}>{t.common.save}</SubmitButton>
      </div>
    </form>
  );
}

function DeleteItem({ t, eventId, id }: { t: Dictionary; eventId: string; id: string }) {
  const router = useRouter();
  const [state, action] = useActionState(deleteTimelineItemAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={action}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="itemId" value={id} />
      <ConfirmSubmit className="btn-ghost btn-sm text-crit-text" message={t.common.delete}>
        {t.common.delete}
      </ConfirmSubmit>
    </form>
  );
}

export function TimelineManager({
  t,
  locale,
  eventId,
  items,
  canManage,
}: {
  t: Dictionary;
  locale: 'ar' | 'en';
  eventId: string;
  items: TimelineRow[];
  canManage: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TimelineRow | null>(null);

  return (
    <>
      {canManage ? (
        <div className="mb-4 flex justify-end">
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <IconPlus width={16} height={16} />
            {t.timeline.newItem}
          </button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="panel">
          <EmptyState
            title={t.timeline.empty}
            hint={t.timeline.emptyHint}
            icon={<IconClock width={20} height={20} />}
            action={
              canManage ? (
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => setCreating(true)}
                >
                  {t.timeline.newItem}
                </button>
              ) : null
            }
          />
        </div>
      ) : (
        <ol className="panel divide-y divide-ink-800">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start gap-4 px-4 py-4">
              <div className="flex w-[86px] shrink-0 flex-col items-start">
                <span className="nums text-[15px] font-semibold text-ink-100">
                  {formatTime(item.scheduledTime, locale)}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[14.5px] font-semibold text-ink-100">{item.title}</p>
                  <Badge
                    tone={timelineTone[item.status as TimelineStatus]}
                    pulse={item.status === 'ACTIVE'}
                  >
                    {t.enums.timelineStatus[item.status as TimelineStatus]}
                  </Badge>
                </div>
                {item.description ? (
                  <p className="mt-1 text-[13px] leading-6 text-ink-400">
                    {item.description}
                  </p>
                ) : null}
              </div>

              {canManage ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => setEditing(item)}
                  >
                    <IconEdit width={15} height={15} />
                    {t.common.edit}
                  </button>
                  <DeleteItem t={t} eventId={eventId} id={item.id} />
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title={t.timeline.newItem}
      >
        <ItemForm t={t} eventId={eventId} onDone={() => setCreating(false)} />
      </Dialog>

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={t.timeline.title}
      >
        {editing ? (
          <ItemForm
            t={t}
            eventId={eventId}
            item={editing}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
    </>
  );
}
