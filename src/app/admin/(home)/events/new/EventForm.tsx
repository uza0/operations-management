'use client';

import { useActionState } from 'react';

import { createEventAction, updateEventAction } from '@/server/actions/events';
import { idle } from '@/server/actions/types';
import { FormError } from '@/components/ui/states';
import { SubmitButton } from '@/components/ui/client';
import { EVENT_TYPES, type EventType } from '@/lib/constants';
import type { Dictionary } from '@/lib/i18n';

export type EventFormValues = {
  id?: string;
  name?: string;
  type?: string;
  venueId?: string;
  date?: string;
  startTime?: string;
  teamArrivalTime?: string;
  description?: string | null;
};

export function EventForm({
  t,
  venues,
  leaders,
  values,
  mode,
  onDone,
}: {
  t: Dictionary;
  venues: { id: string; name: string }[];
  leaders?: { id: string; name: string }[];
  values?: EventFormValues;
  mode: 'create' | 'edit';
  onDone?: () => void;
}) {
  const [state, action] = useActionState(
    mode === 'create' ? createEventAction : updateEventAction,
    idle,
  );

  if (state.status === 'success' && onDone) onDone();

  return (
    <form action={action} className="space-y-4">
      {values?.id ? <input type="hidden" name="eventId" value={values.id} /> : null}

      <div>
        <label className="field-label" htmlFor="name">
          {t.event.name}
        </label>
        <input
          id="name"
          name="name"
          className="field"
          required
          defaultValue={values?.name ?? ''}
          placeholder="الزوراء × الشرطة"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="type">
            {t.event.type}
          </label>
          <select
            id="type"
            name="type"
            className="field"
            defaultValue={values?.type ?? 'FOOTBALL_MATCH'}
          >
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t.enums.eventType[type as EventType]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="venueId">
            {t.event.venue}
          </label>
          <select
            id="venueId"
            name="venueId"
            className="field"
            required
            defaultValue={values?.venueId ?? ''}
          >
            <option value="" disabled>
              {t.common.selectPlaceholder}
            </option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="field-label" htmlFor="date">
            {t.event.date}
          </label>
          <input
            id="date"
            name="date"
            type="date"
            className="field nums"
            required
            defaultValue={values?.date ?? ''}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="startTime">
            {t.event.startTime}
          </label>
          <input
            id="startTime"
            name="startTime"
            type="time"
            className="field nums"
            required
            defaultValue={values?.startTime ?? '19:30'}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="teamArrivalTime">
            {t.event.teamArrivalTime}
          </label>
          <input
            id="teamArrivalTime"
            name="teamArrivalTime"
            type="time"
            className="field nums"
            required
            defaultValue={values?.teamArrivalTime ?? '17:00'}
          />
        </div>
      </div>

      {mode === 'create' && leaders && leaders.length > 0 ? (
        <div>
          <label className="field-label" htmlFor="leaderId">
            {t.enums.role.TEAM_LEADER}{' '}
            <span className="text-ink-500">({t.common.optional})</span>
          </label>
          <select id="leaderId" name="leaderId" className="field" defaultValue="">
            <option value="">{t.common.none}</option>
            {leaders.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label className="field-label" htmlFor="description">
          {t.event.description} <span className="text-ink-500">({t.common.optional})</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          className="field"
          defaultValue={values?.description ?? ''}
        />
      </div>

      {state.status === 'error' ? <FormError message={state.message} /> : null}

      <div className="flex justify-end gap-2 pt-1">
        <SubmitButton pendingLabel={t.common.saving}>
          {mode === 'create' ? t.common.create : t.common.saveChanges}
        </SubmitButton>
      </div>
    </form>
  );
}
