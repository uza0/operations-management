'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  deleteGateAction,
  deleteWorkingPointAction,
  saveGateAction,
  saveWorkingPointAction,
} from '@/server/actions/gates';
import { idle } from '@/server/actions/types';
import { EmptyState, FormError } from '@/components/ui/states';
import {
  Badge,
  StaffingIndicator,
  locationStatusTone,
} from '@/components/ui/status';
import { ConfirmSubmit, Dialog, SubmitButton } from '@/components/ui/client';
import { IconEdit, IconGate, IconPlus, IconTarget } from '@/components/ui/icons';
import {
  GATE_TYPES,
  LOCATION_STATUSES,
  WORKING_POINT_TYPES,
  type GateType,
  type LocationStatus,
  type WorkingPointType,
} from '@/lib/constants';
import { format, type Dictionary } from '@/lib/i18n';
import type { StaffedLocation } from '@/server/services/staffing';

export type GateDetail = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  capacity: number | null;
  requiredStaff: number;
  status: string;
  gateLeaderId: string | null;
};

export type WorkingPointDetail = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  requiredStaff: number;
  status: string;
};

type MemberOption = { id: string; name: string };

function GateForm({
  t,
  eventId,
  gate,
  members,
  onDone,
}: {
  t: Dictionary;
  eventId: string;
  gate?: GateDetail;
  members: MemberOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState(saveGateAction, idle);

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      {gate ? <input type="hidden" name="gateId" value={gate.id} /> : null}

      <div>
        <label className="field-label" htmlFor="gate-name">
          {t.gate.gateName}
        </label>
        <input
          id="gate-name"
          name="name"
          className="field"
          required
          defaultValue={gate?.name ?? ''}
          placeholder="البوابة 4"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="gate-type">
            {t.gate.gateType}
          </label>
          <select
            id="gate-type"
            name="type"
            className="field"
            defaultValue={gate?.type ?? 'GENERAL'}
          >
            {GATE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t.enums.gateType[type as GateType]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="gate-status">
            {t.common.status}
          </label>
          <select
            id="gate-status"
            name="status"
            className="field"
            defaultValue={gate?.status ?? 'INACTIVE'}
          >
            {LOCATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t.enums.locationStatus[status as LocationStatus]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="gate-required">
            {t.gate.requiredStaff}
          </label>
          <input
            id="gate-required"
            name="requiredStaff"
            type="number"
            min={0}
            max={500}
            className="field nums"
            required
            defaultValue={gate?.requiredStaff ?? 3}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="gate-capacity">
            {t.gate.capacity} <span className="text-ink-500">({t.common.optional})</span>
          </label>
          <input
            id="gate-capacity"
            name="capacity"
            type="number"
            min={0}
            className="field nums"
            defaultValue={gate?.capacity ?? ''}
          />
        </div>
      </div>

      {members.length > 0 ? (
        <div>
          <label className="field-label" htmlFor="gate-leader">
            {t.gate.gateLeader} <span className="text-ink-500">({t.common.optional})</span>
          </label>
          <select
            id="gate-leader"
            name="gateLeaderId"
            className="field"
            defaultValue={gate?.gateLeaderId ?? ''}
          >
            <option value="">{t.common.none}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label className="field-label" htmlFor="gate-description">
          {t.common.description} <span className="text-ink-500">({t.common.optional})</span>
        </label>
        <textarea
          id="gate-description"
          name="description"
          rows={2}
          className="field"
          defaultValue={gate?.description ?? ''}
        />
      </div>

      {state.status === 'error' ? <FormError message={state.message} /> : null}

      <div className="flex justify-end">
        <SubmitButton pendingLabel={t.common.saving}>{t.common.save}</SubmitButton>
      </div>
    </form>
  );
}

function WorkingPointForm({
  t,
  eventId,
  point,
  onDone,
}: {
  t: Dictionary;
  eventId: string;
  point?: WorkingPointDetail;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState(saveWorkingPointAction, idle);

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      {point ? <input type="hidden" name="workingPointId" value={point.id} /> : null}

      <div>
        <label className="field-label" htmlFor="wp-name">
          {t.common.name}
        </label>
        <input
          id="wp-name"
          name="name"
          className="field"
          required
          defaultValue={point?.name ?? ''}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="wp-type">
            {t.common.type}
          </label>
          <select
            id="wp-type"
            name="type"
            className="field"
            defaultValue={point?.type ?? 'SCANNER_AREA'}
          >
            {WORKING_POINT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t.enums.workingPointType[type as WorkingPointType]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="wp-status">
            {t.common.status}
          </label>
          <select
            id="wp-status"
            name="status"
            className="field"
            defaultValue={point?.status ?? 'INACTIVE'}
          >
            {LOCATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t.enums.locationStatus[status as LocationStatus]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="wp-required">
          {t.gate.requiredStaff}
        </label>
        <input
          id="wp-required"
          name="requiredStaff"
          type="number"
          min={0}
          max={500}
          className="field nums"
          required
          defaultValue={point?.requiredStaff ?? 1}
        />
      </div>

      <div>
        <label className="field-label" htmlFor="wp-description">
          {t.common.description} <span className="text-ink-500">({t.common.optional})</span>
        </label>
        <textarea
          id="wp-description"
          name="description"
          rows={2}
          className="field"
          defaultValue={point?.description ?? ''}
        />
      </div>

      {state.status === 'error' ? <FormError message={state.message} /> : null}

      <div className="flex justify-end">
        <SubmitButton pendingLabel={t.common.saving}>{t.common.save}</SubmitButton>
      </div>
    </form>
  );
}

function DeleteLocation({
  t,
  eventId,
  location,
}: {
  t: Dictionary;
  eventId: string;
  location: StaffedLocation;
}) {
  const router = useRouter();
  const isGate = location.kind === 'GATE';
  const [state, action] = useActionState(
    isGate ? deleteGateAction : deleteWorkingPointAction,
    idle,
  );

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="eventId" value={eventId} />
      <input
        type="hidden"
        name={isGate ? 'gateId' : 'workingPointId'}
        value={location.id}
      />
      <ConfirmSubmit
        className="btn-ghost btn-sm text-crit-text"
        message={`${t.gate.deleteConfirm}\n${location.name}`}
      >
        {t.common.delete}
      </ConfirmSubmit>
      {state.status === 'error' ? (
        <span className="max-w-[220px] text-end text-[11.5px] leading-4 text-crit-text">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

import { GateSupervisor } from './GateSupervisor';

export function GateManager({
  t,
  eventId,
  locations,
  gates,
  workingPoints,
  members,
  leaderNames,
  supervisors,
  gateSupervisors,
  canManage,
  assignHref,
}: {
  t: Dictionary;
  eventId: string;
  locations: StaffedLocation[];
  gates: GateDetail[];
  workingPoints: WorkingPointDetail[];
  members: MemberOption[];
  leaderNames: Record<string, string>;
  /** Accounts that may supervise a gate, with a label that names the user. */
  supervisors: { id: string; name: string; label: string }[];
  /** The account supervising each gate today, keyed by gate id. */
  gateSupervisors: Record<string, string>;
  canManage: boolean;
  assignHref: string;
}) {
  const [creatingGate, setCreatingGate] = useState(false);
  const [creatingPoint, setCreatingPoint] = useState(false);
  const [editingGate, setEditingGate] = useState<GateDetail | null>(null);
  const [editingPoint, setEditingPoint] = useState<WorkingPointDetail | null>(null);

  const gateLocations = locations.filter((l) => l.kind === 'GATE');
  const pointLocations = locations.filter((l) => l.kind === 'WORKING_POINT');

  function renderCard(location: StaffedLocation) {
    const gate = gates.find((g) => g.id === location.id);
    const point = workingPoints.find((w) => w.id === location.id);
    const leaderName = gate?.gateLeaderId ? leaderNames[gate.gateLeaderId] : null;

    return (
      <article key={location.id} className="panel p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-ink-100">
              {location.name}
            </h3>
            <p className="mt-0.5 text-[12px] text-ink-400">
              {location.kind === 'GATE'
                ? t.enums.gateType[location.type as GateType]
                : t.enums.workingPointType[location.type as WorkingPointType]}
              {location.capacity ? ` · ${t.gate.capacity} ${location.capacity}` : ''}
            </p>
          </div>
          <Badge tone={locationStatusTone[location.status as LocationStatus]}>
            {t.enums.locationStatus[location.status as LocationStatus]}
          </Badge>
        </div>

        <StaffingIndicator
          assigned={location.assignedStaff}
          required={location.requiredStaff}
          level={location.level}
          label={t.enums.staffing[location.level]}
          detail={
            location.difference > 0
              ? format(t.gate.needsMore, { n: location.difference })
              : location.difference < 0
                ? format(t.gate.extraStaff, { n: -location.difference })
                : t.gate.complete
          }
        />

        {leaderName ? (
          <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-ink-300">
            <IconTarget width={14} height={14} className="text-ink-500" />
            {t.gate.gateLeader}: <span className="font-medium">{leaderName}</span>
          </p>
        ) : null}

        {/*
          And, separately, the account that runs this gate. The line above is a
          man from the crew standing at the post; this is who signs in, approves
          the arrivals here and reads the reports. Keeping them apart on the
          same card is the clearest place to show they are not one thing.
        */}
        {gate && canManage ? (
          <GateSupervisor
            t={t}
            eventId={eventId}
            gateId={gate.id}
            current={gateSupervisors[gate.id] ?? null}
            candidates={supervisors}
          />
        ) : null}

        {location.description ? (
          <p className="mt-2 text-[12.5px] leading-5 text-ink-400">
            {location.description}
          </p>
        ) : null}

        {canManage ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink-800 pt-3">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() =>
                location.kind === 'GATE'
                  ? setEditingGate(gate ?? null)
                  : setEditingPoint(point ?? null)
              }
            >
              <IconEdit width={15} height={15} />
              {t.common.edit}
            </button>
            <DeleteLocation t={t} eventId={eventId} location={location} />
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <>
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-ink-100">{t.gate.gates}</h2>
          {canManage ? (
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => setCreatingGate(true)}
            >
              <IconPlus width={15} height={15} />
              {t.gate.newGate}
            </button>
          ) : null}
        </div>

        {gateLocations.length === 0 ? (
          <div className="panel">
            <EmptyState
              title={t.gate.emptyGates}
              hint={t.gate.emptyGatesHint}
              icon={<IconGate width={20} height={20} />}
              action={
                canManage ? (
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() => setCreatingGate(true)}
                  >
                    {t.gate.newGate}
                  </button>
                ) : null
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {gateLocations.map(renderCard)}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-ink-100">{t.gate.workingPoints}</h2>
          {canManage ? (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setCreatingPoint(true)}
            >
              <IconPlus width={15} height={15} />
              {t.gate.newWorkingPoint}
            </button>
          ) : null}
        </div>

        {pointLocations.length === 0 ? (
          <div className="panel">
            <EmptyState
              title={t.gate.emptyWorkingPoints}
              hint={t.gate.emptyWorkingPointsHint}
              action={
                canManage ? (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => setCreatingPoint(true)}
                  >
                    {t.gate.newWorkingPoint}
                  </button>
                ) : null
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pointLocations.map(renderCard)}
          </div>
        )}
      </section>

      <p className="op-crumbs mt-5 text-[12.5px] text-ink-500">
        <a href={assignHref} className="hover:text-ink-300">
          {t.assignment.title} →
        </a>
      </p>

      <Dialog
        open={creatingGate}
        onClose={() => setCreatingGate(false)}
        title={t.gate.newGate}
      >
        <GateForm
          t={t}
          eventId={eventId}
          members={members}
          onDone={() => setCreatingGate(false)}
        />
      </Dialog>

      <Dialog
        open={Boolean(editingGate)}
        onClose={() => setEditingGate(null)}
        title={t.gate.editGate}
      >
        {editingGate ? (
          <GateForm
            t={t}
            eventId={eventId}
            gate={editingGate}
            members={members}
            onDone={() => setEditingGate(null)}
          />
        ) : null}
      </Dialog>

      <Dialog
        open={creatingPoint}
        onClose={() => setCreatingPoint(false)}
        title={t.gate.newWorkingPoint}
      >
        <WorkingPointForm
          t={t}
          eventId={eventId}
          onDone={() => setCreatingPoint(false)}
        />
      </Dialog>

      <Dialog
        open={Boolean(editingPoint)}
        onClose={() => setEditingPoint(null)}
        title={t.gate.editWorkingPoint}
      >
        {editingPoint ? (
          <WorkingPointForm
            t={t}
            eventId={eventId}
            point={editingPoint}
            onDone={() => setEditingPoint(null)}
          />
        ) : null}
      </Dialog>
    </>
  );
}
