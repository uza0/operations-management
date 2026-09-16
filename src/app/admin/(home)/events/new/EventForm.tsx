'use client';

import { useActionState, useState } from 'react';

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
  teamDepartureTime?: string | null;
  description?: string | null;
};

export function EventForm({
  t,
  venues,
  leaders,
  templates,
  values,
  mode,
  onDone,
}: {
  t: Dictionary;
  venues: { id: string; name: string }[];
  leaders?: { id: string; name: string }[];
  /** Past events this one can be built from, newest first. */
  templates?: { id: string; name: string; venueName: string | null; date: string }[];
  values?: EventFormValues;
  mode: 'create' | 'edit';
  onDone?: () => void;
}) {
  const [state, action] = useActionState(
    mode === 'create' ? createEventAction : updateEventAction,
    idle,
  );
  const [templateId, setTemplateId] = useState('');

  if (state.status === 'success' && onDone) onDone();

  return (
    <form action={action} className="space-y-4">
      {values?.id ? <input type="hidden" name="eventId" value={values.id} /> : null}

      {/*
        Most events at a venue are last month's event again. Choosing one here
        is the difference between ten gates re-entered by hand and a plan that
        only needs the people checked.
      */}
      {mode === 'create' && templates && templates.length > 0 ? (
        <div className="panel p-4">
          <label className="field-label" htmlFor="templateEventId">
            {t.event.fromTemplate}
          </label>
          <select
            id="templateEventId"
            name="templateEventId"
            className="field"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">{t.event.templateNone}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
                {template.venueName ? ` — ${template.venueName}` : ''} · {template.date}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[12.5px] leading-5 text-ink-500">
            {t.event.fromTemplateHint}
          </p>

          {templateId ? (
            <div className="mt-3 space-y-2 border-t border-ink-800 pt-3">
              <label className="flex items-start gap-2.5 text-[14px] text-ink-200">
                <input
                  type="checkbox"
                  name="copyTeam"
                  defaultChecked
                  className="mt-0.5 h-4.5 w-4.5 accent-brand-500"
                />
                <span>
                  {t.event.copyTeam}
                  <span className="block text-[12px] text-ink-500">
                    {t.event.copyTeamHint}
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-2.5 text-[14px] text-ink-200">
                <input
                  type="checkbox"
                  name="copyTimeline"
                  defaultChecked
                  className="h-4.5 w-4.5 accent-brand-500"
                />
                {t.event.copyTimeline}
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

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
        <div>
          <label className="field-label" htmlFor="teamDepartureTime">
            {t.event.teamDepartureTime}
          </label>
          <input
            id="teamDepartureTime"
            name="teamDepartureTime"
            type="time"
            className="field nums"
            defaultValue={values?.teamDepartureTime ?? '22:30'}
          />
        </div>
      </div>

      {/*
        Said once, where the two times are set: this is the team's shift, and
        nobody has to repeat it person by person afterwards.
      */}
      <p className="-mt-1 text-[12.5px] leading-5 text-ink-500">{t.event.teamHoursHint}</p>

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
