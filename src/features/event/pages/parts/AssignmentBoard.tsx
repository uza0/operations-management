'use client';

import dynamic from 'next/dynamic';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  cancelAssignmentAction,
  saveAssignmentAction,
} from '@/server/actions/assignments';
import { idle } from '@/server/actions/types';
import { EmptyState, FormError, Notice } from '@/components/ui/states';
import { Badge, assignmentTone } from '@/components/ui/status';
import { ConfirmSubmit, Dialog, SubmitButton } from '@/components/ui/client';
import {
  IconClipboard,
  IconEdit,
  IconList,
  IconMap,
  IconPlus,
  IconSearch,
  IconTarget,
} from '@/components/ui/icons';
import { TASKS, type AssignmentStatus, type Task } from '@/lib/constants';
import { formatTime } from '@/lib/time';
import type { Dictionary } from '@/lib/i18n';
import type { AssignmentRow } from '@/server/services/assignments';
import type { StaffedLocation } from '@/server/services/staffing';

import type { StageMarker } from '@/components/map/MapStage';

const MapStage = dynamic(
  () => import('@/components/map/MapStage').then((m) => m.MapStage),
  {
    ssr: false,
    loading: () => (
      <div className="h-[560px] w-full animate-pulseSoft rounded-lg border border-ink-700 bg-ink-900" />
    ),
  },
);

export type AssignableMember = {
  id: string;
  name: string;
  employeeCode: string;
  isReserve: boolean;
  assigned: boolean;
};

export type MapMarkerLite = {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  gateId: string | null;
  workingPointId: string | null;
};

type Props = {
  t: Dictionary;
  locale: 'ar' | 'en';
  eventId: string;
  assignments: AssignmentRow[];
  locations: StaffedLocation[];
  members: AssignableMember[];
  markers: MapMarkerLite[];
  mapImageUrl: string | null;
  defaultArrival: string;
  /** The event's stand-down time, when it has one. */
  defaultDeparture: string | null;
  canManage: boolean;
};

/* -------------------------------------------------------------------------- */

function AssignmentForm({
  t,
  locale,
  eventId,
  locations,
  members,
  defaultArrival,
  defaultDeparture,
  editing,
  presetLocationId,
  onDone,
}: {
  t: Dictionary;
  locale: 'ar' | 'en';
  eventId: string;
  locations: StaffedLocation[];
  members: AssignableMember[];
  defaultArrival: string;
  defaultDeparture: string | null;
  editing?: AssignmentRow | null;
  presetLocationId?: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState(saveAssignmentAction, idle);
  /*
   * Editing someone who already has hours of their own opens with the fields
   * showing — otherwise they would be hidden and silently rewritten on save.
   */
  const [customHours, setCustomHours] = useState(
    Boolean(
      editing &&
        (editing.arrivalTime !== defaultArrival ||
          editing.shiftStart !== defaultArrival ||
          (defaultDeparture !== null && editing.shiftEnd !== defaultDeparture)),
    ),
  );

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  const selectable = members.filter((m) => !m.assigned || m.id === editing?.eventMemberId);
  const currentLocation =
    editing?.gateId ?? editing?.workingPointId ?? presetLocationId ?? '';
  const conflict = state.status === 'conflict';

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      {editing ? <input type="hidden" name="assignmentId" value={editing.id} /> : null}
      {/* Re-submitting after a warning is an explicit override, never silent. */}
      {conflict ? <input type="hidden" name="force" value="true" /> : null}

      <div>
        <label className="field-label" htmlFor="a-member">
          {t.assignment.member}
        </label>
        <select
          id="a-member"
          name="eventMemberId"
          className="field"
          required
          defaultValue={editing?.eventMemberId ?? ''}
          disabled={Boolean(editing)}
        >
          <option value="" disabled>
            {t.common.selectPlaceholder}
          </option>
          {selectable.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} — {m.employeeCode}
              {m.isReserve ? ` (${t.eventTeam.reserve})` : ''}
            </option>
          ))}
        </select>
        {editing ? (
          <input type="hidden" name="eventMemberId" value={editing.eventMemberId} />
        ) : null}
      </div>

      <div>
        <label className="field-label" htmlFor="a-location">
          {t.assignment.location}
        </label>
        <select
          id="a-location"
          name="location"
          className="field"
          required
          defaultValue={currentLocation}
          onChange={(e) => {
            const form = e.currentTarget.form;
            if (!form) return;
            const value = e.currentTarget.value;
            const match = locations.find((l) => l.id === value);
            (form.elements.namedItem('gateId') as HTMLInputElement).value =
              match?.kind === 'GATE' ? value : '';
            (form.elements.namedItem('workingPointId') as HTMLInputElement).value =
              match?.kind === 'WORKING_POINT' ? value : '';
          }}
        >
          <option value="" disabled>
            {t.common.selectPlaceholder}
          </option>
          <optgroup label={t.gate.gates}>
            {locations
              .filter((l) => l.kind === 'GATE')
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.assignedStaff}/{l.requiredStaff})
                </option>
              ))}
          </optgroup>
          <optgroup label={t.gate.workingPoints}>
            {locations
              .filter((l) => l.kind === 'WORKING_POINT')
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.assignedStaff}/{l.requiredStaff})
                </option>
              ))}
          </optgroup>
        </select>
        <input
          type="hidden"
          name="gateId"
          defaultValue={
            editing?.gateId ??
            (locations.find((l) => l.id === presetLocationId)?.kind === 'GATE'
              ? (presetLocationId ?? '')
              : '')
          }
        />
        <input
          type="hidden"
          name="workingPointId"
          defaultValue={
            editing?.workingPointId ??
            (locations.find((l) => l.id === presetLocationId)?.kind === 'WORKING_POINT'
              ? (presetLocationId ?? '')
              : '')
          }
        />
      </div>

      <div>
        <label className="field-label" htmlFor="a-task">
          {t.assignment.task}
        </label>
        <select
          id="a-task"
          name="task"
          className="field"
          defaultValue={editing?.task ?? 'ELECTRONIC_SCANNING'}
        >
          {TASKS.map((task) => (
            <option key={task} value={task}>
              {t.enums.task[task as Task]}
            </option>
          ))}
        </select>
      </div>

      {/*
        The hours come from the event, so this is folded away. Opening it is a
        deliberate act — "this person's hours are different" — which is exactly
        how often it should happen. The inputs stay mounted either way, because
        the form still has to submit three times.
      */}
      <div>
        <label className="flex items-center gap-2.5 text-[14px] text-ink-200">
          <input
            type="checkbox"
            checked={customHours}
            onChange={(e) => setCustomHours(e.target.checked)}
            className="h-4.5 w-4.5 accent-brand-500"
          />
          {t.event.customHours}
        </label>
        {!customHours ? (
          <p className="mt-1 text-[12.5px] text-ink-500">
            {t.event.followsEventHours} — {formatTime(defaultArrival, locale)}
            {defaultDeparture ? ` – ${formatTime(defaultDeparture, locale)}` : ''}
          </p>
        ) : null}
      </div>

      <div
        className={`grid grid-cols-1 gap-4 sm:grid-cols-3 ${customHours ? '' : 'hidden'}`}
      >
        <div>
          <label className="field-label" htmlFor="a-arrival">
            {t.assignment.arrival}
          </label>
          <input
            id="a-arrival"
            name="arrivalTime"
            type="time"
            className="field nums"
            required
            defaultValue={editing?.arrivalTime ?? defaultArrival}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="a-start">
            {t.assignment.shiftStart}
          </label>
          <input
            id="a-start"
            name="shiftStart"
            type="time"
            className="field nums"
            required
            defaultValue={editing?.shiftStart ?? defaultArrival}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="a-end">
            {t.assignment.shiftEnd}
          </label>
          <input
            id="a-end"
            name="shiftEnd"
            type="time"
            className="field nums"
            required
            defaultValue={editing?.shiftEnd ?? defaultDeparture ?? '22:30'}
          />
        </div>
      </div>

      <label className="flex items-center gap-2.5 text-[14px] text-ink-200">
        <input
          type="checkbox"
          name="isGateLeader"
          defaultChecked={editing?.isGateLeader ?? false}
          className="h-4.5 w-4.5 accent-brand-500"
        />
        {t.assignment.assignAsGateLeader}
      </label>

      {editing ? (
        <div>
          <label className="field-label" htmlFor="a-reason">
            {t.assignment.moveReason}{' '}
            <span className="text-ink-500">({t.common.optional})</span>
          </label>
          <input id="a-reason" name="reason" className="field" />
          <p className="mt-1 text-[11.5px] text-ink-500">{t.assignment.moveReasonHint}</p>
        </div>
      ) : null}

      <div>
        <label className="field-label" htmlFor="a-notes">
          {t.common.notes} <span className="text-ink-500">({t.common.optional})</span>
        </label>
        <textarea
          id="a-notes"
          name="notes"
          rows={2}
          className="field"
          defaultValue={editing?.notes ?? ''}
        />
      </div>

      {conflict ? (
        <Notice tone="warn">
          <span className="font-semibold">{t.assignment.conflictTitle}</span> —{' '}
          {state.message}
        </Notice>
      ) : null}
      {state.status === 'error' ? <FormError message={state.message} /> : null}

      <div className="flex justify-end gap-2">
        <SubmitButton
          className={conflict ? 'btn-danger' : 'btn-primary'}
          pendingLabel={t.common.saving}
        >
          {conflict ? t.assignment.conflictProceed : t.common.save}
        </SubmitButton>
      </div>
    </form>
  );
}

function CancelAssignment({
  t,
  eventId,
  assignment,
}: {
  t: Dictionary;
  eventId: string;
  assignment: AssignmentRow;
}) {
  const router = useRouter();
  const [state, action] = useActionState(cancelAssignmentAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="inline">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="assignmentId" value={assignment.id} />
      <ConfirmSubmit
        className="btn-ghost btn-sm text-crit-text"
        message={`${t.assignment.cancelConfirm}\n${assignment.memberName}`}
      >
        {t.common.cancel}
      </ConfirmSubmit>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

export function AssignmentBoard({
  t,
  locale,
  eventId,
  assignments,
  locations,
  members,
  markers,
  mapImageUrl,
  defaultArrival,
  defaultDeparture,
  canManage,
}: Props) {
  const [view, setView] = useState<'list' | 'map'>('list');
  const [creating, setCreating] = useState(false);
  const [preset, setPreset] = useState<string | null>(null);
  const [editing, setEditing] = useState<AssignmentRow | null>(null);

  const [query, setQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [taskFilter, setTaskFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [focusLocation, setFocusLocation] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assignments.filter(
      (a) =>
        (!q ||
          a.memberName.toLowerCase().includes(q) ||
          a.employeeCode.toLowerCase().includes(q)) &&
        (!locationFilter ||
          a.gateId === locationFilter ||
          a.workingPointId === locationFilter) &&
        (!taskFilter || a.task === taskFilter) &&
        (!statusFilter || a.status === statusFilter),
    );
  }, [assignments, query, locationFilter, taskFilter, statusFilter]);

  const unassigned = members.filter((m) => !m.assigned);

  const countsByLocation = useMemo(() => {
    const map = new Map<string, AssignmentRow[]>();
    for (const a of assignments) {
      if (a.status === 'CANCELLED') continue;
      const key = a.gateId ?? a.workingPointId ?? '';
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return map;
  }, [assignments]);

  const stageMarkers: StageMarker[] = useMemo(
    () =>
      markers.map((m) => {
        const locationId = m.gateId ?? m.workingPointId ?? '';
        const location = locations.find((l) => l.id === locationId);
        return {
          id: m.id,
          type: m.type,
          name: m.name,
          x: m.x,
          y: m.y,
          badge: location
            ? `${location.assignedStaff}/${location.requiredStaff}`
            : null,
          highlight: Boolean(locationId) && locationId === focusLocation,
          dimmed: Boolean(focusLocation) && locationId !== focusLocation,
        };
      }),
    [markers, locations, focusLocation],
  );

  const focusAssignments = focusLocation
    ? (countsByLocation.get(focusLocation) ?? [])
    : [];
  const focusDetails = locations.find((l) => l.id === focusLocation);

  return (
    <>
      {/* Toolbar ---------------------------------------------------------- */}
      {/* One row on a phone: the view switch takes the space it needs and the
          add button collapses to its icon. */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1 sm:flex-none">
          <button
            type="button"
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
            className={`btn btn-sm flex-1 sm:flex-none ${
              view === 'list' ? 'bg-ink-750 text-ink-100' : 'text-ink-400'
            }`}
          >
            <IconList width={15} height={15} />
            {t.assignment.listView}
          </button>
          <button
            type="button"
            onClick={() => setView('map')}
            aria-pressed={view === 'map'}
            disabled={!mapImageUrl}
            className={`btn btn-sm flex-1 sm:flex-none ${
              view === 'map' ? 'bg-ink-750 text-ink-100' : 'text-ink-400'
            }`}
          >
            <IconMap width={15} height={15} />
            {t.assignment.mapView}
          </button>
        </div>

        {canManage ? (
          <button
            type="button"
            className="btn-primary shrink-0"
            onClick={() => {
              setPreset(null);
              setCreating(true);
            }}
          >
            <IconPlus width={16} height={16} />
            <span className="hidden sm:inline">{t.assignment.newAssignment}</span>
            <span className="sr-only sm:hidden">{t.assignment.newAssignment}</span>
          </button>
        ) : null}
      </div>

      {/* Unassigned pool -------------------------------------------------- */}
      {unassigned.length > 0 ? (
        <div className="panel mb-4 p-3.5">
          <p className="mb-2 text-[12.5px] font-semibold text-ink-300">
            {t.assignment.unassignedMembers}{' '}
            <span className="nums text-ink-500">({unassigned.length})</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unassigned.map((m) => (
              <span
                key={m.id}
                className={`chip ${
                  m.isReserve
                    ? 'border-info/40 bg-info/10 text-info-text'
                    : 'border-ink-600 bg-ink-850 text-ink-300'
                }`}
              >
                {m.name}
                {m.isReserve ? ` · ${t.eventTeam.reserve}` : ''}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {view === 'list' ? (
        <>
          {/* Filters ------------------------------------------------------ */}
          <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="relative col-span-2 lg:col-span-1">
              <IconSearch
                width={16}
                height={16}
                className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-500 start-3"
              />
              <input
                className="field ps-9"
                placeholder={t.assignment.searchMember}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={t.assignment.searchMember}
              />
            </div>
            <select
              className="field"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              aria-label={t.assignment.filterByGate}
            >
              <option value="">
                {t.assignment.location} — {t.common.all}
              </option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select
              className="field"
              value={taskFilter}
              onChange={(e) => setTaskFilter(e.target.value)}
              aria-label={t.assignment.filterByTask}
            >
              <option value="">
                {t.assignment.task} — {t.common.all}
              </option>
              {TASKS.map((task) => (
                <option key={task} value={task}>
                  {t.enums.task[task as Task]}
                </option>
              ))}
            </select>
            <select
              className="field col-span-2 lg:col-span-1"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={t.assignment.filterByStatus}
            >
              <option value="">
                {t.common.status} — {t.common.all}
              </option>
              {(['ASSIGNED', 'CONFIRMED', 'CHANGED', 'CANCELLED'] as AssignmentStatus[]).map(
                (status) => (
                  <option key={status} value={status}>
                    {t.enums.assignmentStatus[status]}
                  </option>
                ),
              )}
            </select>
          </div>

          <div className="panel">
            {filtered.length === 0 ? (
              <EmptyState
                title={assignments.length ? t.common.noResults : t.assignment.empty}
                hint={assignments.length ? undefined : t.assignment.emptyHint}
                icon={<IconClipboard width={20} height={20} />}
                action={
                  canManage && assignments.length === 0 ? (
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={() => setCreating(true)}
                    >
                      {t.assignment.newAssignment}
                    </button>
                  ) : null
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="op-table op-table-stack">
                  <thead>
                    <tr>
                      <th>{t.assignment.member}</th>
                      <th>{t.assignment.location}</th>
                      <th>{t.assignment.task}</th>
                      <th>{t.assignment.arrival}</th>
                      <th>{t.assignment.shift}</th>
                      <th>{t.common.status}</th>
                      {canManage ? <th className="text-end">{t.common.actions}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => (
                      <tr key={a.id} className={a.status === 'CANCELLED' ? 'opacity-55' : ''}>
                        <td data-label="">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-ink-100">{a.memberName}</span>
                            {a.isGateLeader ? (
                              <Badge tone="brand" dot={false}>
                                <IconTarget width={12} height={12} />
                                {t.gate.gateLeader}
                              </Badge>
                            ) : null}
                            {a.isReserve ? (
                              <Badge tone="info" dot={false}>
                                {t.eventTeam.reserve}
                              </Badge>
                            ) : null}
                          </div>
                          <span className="nums text-[12px] text-ink-500">
                            {a.employeeCode}
                          </span>
                        </td>
                        <td data-label={t.assignment.location} className="text-ink-200">
                          {a.locationName}
                        </td>
                        <td data-label={t.assignment.task} className="text-ink-300">
                          {t.enums.task[a.task as Task]}
                        </td>
                        <td data-label={t.assignment.arrival} className="nums text-ink-200">
                          {formatTime(a.arrivalTime, locale)}
                        </td>
                        <td data-label={t.assignment.shift} className="nums text-ink-400">
                          {formatTime(a.shiftStart, locale)} –{' '}
                          {formatTime(a.shiftEnd, locale)}
                        </td>
                        <td data-label={t.common.status}>
                          <Badge tone={assignmentTone[a.status as AssignmentStatus]}>
                            {t.enums.assignmentStatus[a.status as AssignmentStatus]}
                          </Badge>
                        </td>
                        {canManage ? (
                          <td data-label="">
                            <div className="flex items-center gap-1 sm:justify-end">
                              <button
                                type="button"
                                className="btn-ghost btn-sm flex-1 sm:flex-none"
                                onClick={() => setEditing(a)}
                              >
                                <IconEdit width={15} height={15} />
                                {t.assignment.moveTitle}
                              </button>
                              {a.status !== 'CANCELLED' ? (
                                <CancelAssignment t={t} eventId={eventId} assignment={a} />
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            {mapImageUrl ? (
              <MapStage
                imageUrl={mapImageUrl}
                markers={stageMarkers}
                selectedId={null}
                onSelect={(id) => {
                  const marker = markers.find((m) => m.id === id);
                  setFocusLocation(marker?.gateId ?? marker?.workingPointId ?? null);
                }}
                height={560}
              />
            ) : (
              <div className="panel">
                <EmptyState title={t.map.noMap} hint={t.map.noMapHint} />
              </div>
            )}
          </div>

          <aside className="panel p-4">
            {!focusDetails ? (
              <EmptyState title={t.map.noSelection} />
            ) : (
              <div className="space-y-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-ink-100">
                    {focusDetails.name}
                  </h3>
                  <p className="nums mt-0.5 text-[13px] text-ink-400">
                    {focusDetails.assignedStaff} / {focusDetails.requiredStaff} —{' '}
                    {t.enums.staffing[focusDetails.level]}
                  </p>
                </div>

                {focusAssignments.length === 0 ? (
                  <p className="text-[13px] text-ink-500">{t.assignment.empty}</p>
                ) : (
                  <ul className="space-y-2">
                    {focusAssignments.map((a) => (
                      <li
                        key={a.id}
                        className="rounded-lg border border-ink-700 bg-ink-850/70 px-3 py-2"
                      >
                        <p className="text-[13.5px] font-medium text-ink-100">
                          {a.memberName}
                          {a.isGateLeader ? ` · ${t.gate.gateLeader}` : ''}
                        </p>
                        <p className="text-[12px] text-ink-400">
                          {t.enums.task[a.task as Task]} ·{' '}
                          <span className="nums">{formatTime(a.arrivalTime, locale)}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                )}

                {canManage ? (
                  <button
                    type="button"
                    className="btn-secondary btn-sm w-full"
                    onClick={() => {
                      setPreset(focusDetails.id);
                      setCreating(true);
                    }}
                  >
                    <IconPlus width={15} height={15} />
                    {t.assignment.newAssignment}
                  </button>
                ) : null}
              </div>
            )}
          </aside>
        </div>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title={t.assignment.newAssignment}
        description={t.assignment.subtitle}
        wide
      >
        <AssignmentForm
          t={t}
          eventId={eventId}
          locations={locations}
          members={members}
          locale={locale}
          defaultArrival={defaultArrival}
          defaultDeparture={defaultDeparture}
          presetLocationId={preset}
          onDone={() => setCreating(false)}
        />
      </Dialog>

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={t.assignment.moveTitle}
        description={editing?.memberName}
        wide
      >
        {editing ? (
          <AssignmentForm
            t={t}
            eventId={eventId}
            locations={locations}
            members={members}
            locale={locale}
            defaultArrival={defaultArrival}
            defaultDeparture={defaultDeparture}
            editing={editing}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
    </>
  );
}
