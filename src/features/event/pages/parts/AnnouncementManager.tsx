'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  createAnnouncementAction,
  deleteAnnouncementAction,
} from '@/server/actions/operations';
import { idle } from '@/server/actions/types';
import { EmptyState, FormError } from '@/components/ui/states';
import { Badge, priorityTone } from '@/components/ui/status';
import { ConfirmSubmit, Dialog, SubmitButton } from '@/components/ui/client';
import { IconMegaphone, IconPlus } from '@/components/ui/icons';
import { AUDIENCES, PRIORITIES, type Audience, type Priority } from '@/lib/constants';
import { formatDateTime } from '@/lib/time';
import type { Dictionary } from '@/lib/i18n';

export type AnnouncementRow = {
  id: string;
  title: string;
  message: string;
  priority: string;
  audience: string;
  targetName: string | null;
  createdByName: string;
  createdAt: Date;
  expiresAt: Date | null;
};

type Option = { id: string; name: string };

function AnnouncementForm({
  t,
  eventId,
  gates,
  workingPoints,
  members,
  onDone,
}: {
  t: Dictionary;
  eventId: string;
  gates: Option[];
  workingPoints: Option[];
  members: Option[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState(createAnnouncementAction, idle);
  const [audience, setAudience] = useState<Audience>('EVENT');

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />

      <div>
        <label className="field-label" htmlFor="an-title">
          {t.announcement.announcementTitle}
        </label>
        <input id="an-title" name="title" className="field" required />
      </div>

      <div>
        <label className="field-label" htmlFor="an-message">
          {t.announcement.message}
        </label>
        <textarea id="an-message" name="message" rows={4} className="field" required />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="an-priority">
            {t.announcement.priority}
          </label>
          <select id="an-priority" name="priority" className="field" defaultValue="NORMAL">
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t.enums.priority[p as Priority]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="an-audience">
            {t.announcement.audience}
          </label>
          <select
            id="an-audience"
            name="audience"
            className="field"
            value={audience}
            onChange={(e) => setAudience(e.target.value as Audience)}
          >
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {t.enums.audience[a as Audience]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {audience === 'GATE' ? (
        <div>
          <label className="field-label" htmlFor="an-gate">
            {t.announcement.targetGate}
          </label>
          <select id="an-gate" name="gateId" className="field" required>
            <option value="">{t.common.selectPlaceholder}</option>
            {gates.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {audience === 'WORKING_POINT' ? (
        <div>
          <label className="field-label" htmlFor="an-wp">
            {t.announcement.targetWorkingPoint}
          </label>
          <select id="an-wp" name="workingPointId" className="field" required>
            <option value="">{t.common.selectPlaceholder}</option>
            {workingPoints.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {audience === 'MEMBER' ? (
        <div>
          <label className="field-label" htmlFor="an-member">
            {t.announcement.targetMember}
          </label>
          <select id="an-member" name="eventMemberId" className="field" required>
            <option value="">{t.common.selectPlaceholder}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label className="field-label" htmlFor="an-expires">
          {t.announcement.expiresAt}{' '}
          <span className="text-ink-500">({t.common.optional})</span>
        </label>
        <input
          id="an-expires"
          name="expiresAt"
          type="datetime-local"
          className="field nums"
        />
      </div>

      <p className="text-[12px] text-ink-500">{t.announcement.audienceHint}</p>

      {state.status === 'error' ? <FormError message={state.message} /> : null}

      <div className="flex justify-end">
        <SubmitButton pendingLabel={t.common.saving}>{t.common.create}</SubmitButton>
      </div>
    </form>
  );
}

function DeleteAnnouncement({
  t,
  eventId,
  id,
}: {
  t: Dictionary;
  eventId: string;
  id: string;
}) {
  const router = useRouter();
  const [state, action] = useActionState(deleteAnnouncementAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={action}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="announcementId" value={id} />
      <ConfirmSubmit
        className="btn-ghost btn-sm text-crit-text"
        message={t.announcement.deleteConfirm}
      >
        {t.common.delete}
      </ConfirmSubmit>
    </form>
  );
}

export function AnnouncementManager({
  t,
  locale,
  eventId,
  announcements,
  gates,
  workingPoints,
  members,
  canManage,
}: {
  t: Dictionary;
  locale: 'ar' | 'en';
  eventId: string;
  announcements: AnnouncementRow[];
  gates: Option[];
  workingPoints: Option[];
  members: Option[];
  canManage: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const now = Date.now();

  return (
    <>
      {canManage ? (
        <div className="mb-4 flex justify-end">
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <IconPlus width={16} height={16} />
            {t.announcement.newAnnouncement}
          </button>
        </div>
      ) : null}

      {announcements.length === 0 ? (
        <div className="panel">
          <EmptyState
            title={t.announcement.empty}
            hint={t.announcement.emptyHint}
            icon={<IconMegaphone width={20} height={20} />}
            action={
              canManage ? (
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => setCreating(true)}
                >
                  {t.announcement.newAnnouncement}
                </button>
              ) : null
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {announcements.map((row) => {
            const expired = row.expiresAt ? row.expiresAt.getTime() < now : false;
            const urgent = row.priority === 'URGENT' && !expired;
            return (
              <li
                key={row.id}
                className={`panel p-4 ${
                  urgent ? 'border-crit/50 shadow-[0_0_0_1px_rgba(220,38,38,0.25)]' : ''
                } ${expired ? 'opacity-60' : ''}`}
              >
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold text-ink-100">{row.title}</h3>
                    <p className="mt-0.5 text-[12px] text-ink-500">
                      {t.enums.audience[row.audience as Audience]}
                      {row.targetName ? ` · ${row.targetName}` : ''} · {row.createdByName}{' '}
                      ·{' '}
                      <span className="nums">{formatDateTime(row.createdAt, locale)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {expired ? (
                      <Badge tone="neutral">{t.announcement.expired}</Badge>
                    ) : null}
                    <Badge tone={priorityTone[row.priority as Priority]} pulse={urgent}>
                      {t.enums.priority[row.priority as Priority]}
                    </Badge>
                  </div>
                </div>
                <p className="whitespace-pre-line text-[13.5px] leading-6 text-ink-300">
                  {row.message}
                </p>
                {canManage ? (
                  <div className="mt-3 flex justify-end border-t border-ink-800 pt-2">
                    <DeleteAnnouncement t={t} eventId={eventId} id={row.id} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title={t.announcement.newAnnouncement}
        description={t.announcement.subtitle}
      >
        <AnnouncementForm
          t={t}
          eventId={eventId}
          gates={gates}
          workingPoints={workingPoints}
          members={members}
          onDone={() => setCreating(false)}
        />
      </Dialog>
    </>
  );
}
