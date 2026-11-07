'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { saveMarkersAction, type MarkerInput } from '@/server/actions/markers';
import { MARKER_STYLE, MARKER_TYPES, type MarkerType } from '@/lib/constants';
import { Notice, FormError, EmptyState } from '@/components/ui/states';
import { Badge } from '@/components/ui/status';
import { IconMinus, IconPlus, IconRefresh, IconTrash, IconCopy, IconMap } from '@/components/ui/icons';
import type { Dictionary } from '@/lib/i18n';

import type { StageMarker } from './MapStage';

// Konva touches `window` at import time, so the canvas is client-only.
const MapStage = dynamic(() => import('./MapStage').then((m) => m.MapStage), {
  ssr: false,
  loading: () => (
    <div className="h-[560px] w-full animate-pulseSoft rounded-lg border border-ink-700 bg-ink-900" />
  ),
});

export type EditorMarker = MarkerInput & { id: string };

type Option = { id: string; name: string };

const TOOLBOX: MarkerType[] = [
  'GATE',
  'WORKING_POINT',
  'VIP_ENTRANCE',
  'SCANNER',
  'WRISTBAND',
  'TEAM_LEADER',
  'GATE_LEADER',
  'TEAM_MEMBER',
  'INFORMATION',
  'EMERGENCY',
  'STAFF_ENTRANCE',
  'PLAYER_ENTRANCE',
  'OTHER',
];

function localId() {
  return `new-${Math.random().toString(36).slice(2, 10)}`;
}

export function MapEditor({
  t,
  eventId,
  imageUrl,
  initialMarkers,
  gates,
  workingPoints,
  members,
  canManage,
}: {
  t: Dictionary;
  eventId: string;
  imageUrl: string;
  initialMarkers: EditorMarker[];
  gates: Option[];
  workingPoints: Option[];
  members: Option[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [markers, setMarkers] = useState<EditorMarker[]>(initialMarkers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<MarkerType | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const selected = markers.find((m) => m.id === selectedId) ?? null;

  const stageMarkers: StageMarker[] = useMemo(
    () =>
      markers.map((m) => ({
        id: m.id,
        type: m.type,
        name: m.name,
        x: m.x,
        y: m.y,
        highlight: m.id === selectedId,
      })),
    [markers, selectedId],
  );

  function update(id: string, patch: Partial<EditorMarker>) {
    setMarkers((current) =>
      current.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );
    setDirty(true);
    setSaved(false);
  }

  function place(x: number, y: number) {
    if (!tool || !canManage) return;
    const id = localId();
    const count = markers.filter((m) => m.type === tool).length + 1;
    setMarkers((current) => [
      ...current,
      {
        id,
        type: tool,
        name: `${t.enums.markerType[tool]} ${count}`,
        description: null,
        x,
        y,
        gateId: null,
        workingPointId: null,
        eventMemberId: null,
      },
    ]);
    setSelectedId(id);
    setTool(null);
    setDirty(true);
    setSaved(false);
  }

  function duplicate() {
    if (!selected) return;
    const id = localId();
    setMarkers((current) => [
      ...current,
      {
        ...selected,
        id,
        name: `${selected.name} (2)`,
        x: Math.min(selected.x + 0.03, 1),
        y: Math.min(selected.y + 0.03, 1),
      },
    ]);
    setSelectedId(id);
    setDirty(true);
    setSaved(false);
  }

  function remove() {
    if (!selected) return;
    if (!window.confirm(`${t.map.deleteMarker} — ${selected.name}?`)) return;
    setMarkers((current) => current.filter((m) => m.id !== selected.id));
    setSelectedId(null);
    setDirty(true);
    setSaved(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const payload: MarkerInput[] = markers.map((m) => ({
        id: m.id.startsWith('new-') ? undefined : m.id,
        type: m.type,
        name: m.name,
        description: m.description,
        x: m.x,
        y: m.y,
        gateId: m.gateId,
        workingPointId: m.workingPointId,
        eventMemberId: m.eventMemberId,
      }));
      const result = await saveMarkersAction(eventId, payload);
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      setDirty(false);
      setSaved(true);
      router.refresh();
    });
  }

  function zoom(action: 'in' | 'out' | 'reset') {
    document
      .querySelector('[data-map-stage]')
      ?.dispatchEvent(new CustomEvent('map-zoom', { detail: { action } }));
  }

  const linkKind = selected?.gateId
    ? 'GATE'
    : selected?.workingPointId
      ? 'WORKING_POINT'
      : selected?.eventMemberId
        ? 'MEMBER'
        : 'NONE';

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[196px_minmax(0,1fr)_284px]">
      {/* Toolbox ---------------------------------------------------------- */}
      <aside className="panel order-2 p-3 lg:order-1">
        <p className="mb-2 px-1 text-[12.5px] font-semibold uppercase tracking-wide text-ink-500">
          {t.map.toolbox}
        </p>
        {/* Two columns on a phone, three on a tablet, a single rail on desktop. */}
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
          <button
            type="button"
            onClick={() => setTool(null)}
            aria-pressed={tool === null}
            className={`flex min-h-[44px] items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
              tool === null
                ? 'bg-brand-500/14 text-brand-300'
                : 'text-ink-300 hover:bg-ink-800'
            }`}
          >
            <span className="grid h-5 w-5 place-items-center rounded-full border border-ink-500 text-[10px]">
              ▣
            </span>
            {t.map.select}
          </button>
          {TOOLBOX.map((type) => {
            const style = MARKER_STYLE[type];
            return (
              <button
                key={type}
                type="button"
                disabled={!canManage}
                onClick={() => setTool(type)}
                aria-pressed={tool === type}
                className={`flex min-h-[44px] items-center gap-2 rounded-lg px-2.5 py-2 text-start text-[13px] font-medium transition-colors disabled:opacity-40 ${
                  tool === type
                    ? 'bg-brand-500/14 text-brand-300'
                    : 'text-ink-300 hover:bg-ink-800'
                }`}
              >
                <span
                  aria-hidden
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-ink-950"
                  style={{ background: style.color }}
                >
                  {style.glyph}
                </span>
                <span className="truncate">{t.enums.markerType[type]}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Canvas ----------------------------------------------------------- */}
      <div className="order-1 space-y-3 lg:order-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button type="button" className="btn-secondary btn-sm" onClick={() => zoom('in')}>
              <IconPlus width={15} height={15} />
              <span className="sr-only">{t.map.zoomIn}</span>
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => zoom('out')}>
              <IconMinus width={15} height={15} />
              <span className="sr-only">{t.map.zoomOut}</span>
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => zoom('reset')}
            >
              <IconRefresh width={15} height={15} />
              <span className="hidden sm:inline">{t.map.resetView}</span>
              <span className="sr-only sm:hidden">{t.map.resetView}</span>
            </button>
            <span className="ms-1 hidden text-[12px] text-ink-500 sm:inline">
              {t.map.markersCount}: <span className="nums">{markers.length}</span>
            </span>
          </div>

          {canManage ? (
            <div className="flex items-center gap-2">
              {dirty ? <Badge tone="warn">{t.map.unsaved}</Badge> : null}
              {saved && !dirty ? <Badge tone="ok">{t.map.markersSaved}</Badge> : null}
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={save}
                disabled={pending || !dirty}
              >
                {pending ? t.common.saving : t.map.saveMarkers}
              </button>
            </div>
          ) : null}
        </div>

        {tool ? (
          <Notice tone="info">{t.map.clickToPlace}</Notice>
        ) : (
          <p className="text-[12px] text-ink-500">{t.map.dragHint}</p>
        )}

        <MapStage
          imageUrl={imageUrl}
          markers={stageMarkers}
          selectedId={selectedId}
          draggable={canManage}
          onSelect={setSelectedId}
          onMove={(id, x, y) => update(id, { x, y })}
          onCanvasClick={place}
          responsiveHeight
          failedTitle={t.map.imageFailed}
          failedHint={t.map.imageFailedHint}
        />

        <FormError message={error} />
      </div>

      {/* Properties ------------------------------------------------------- */}
      <aside className="panel order-3 p-4">
        <p className="mb-3 text-[12.5px] font-semibold uppercase tracking-wide text-ink-500">
          {t.map.properties}
        </p>

        {!selected ? (
          <EmptyState title={t.map.noSelection} icon={<IconMap width={20} height={20} />} />
        ) : (
          <div className="space-y-3.5">
            <div>
              <label className="field-label" htmlFor="marker-name">
                {t.map.markerName}
              </label>
              <input
                id="marker-name"
                className="field"
                value={selected.name}
                disabled={!canManage}
                onChange={(e) => update(selected.id, { name: e.target.value })}
              />
            </div>

            <div>
              <label className="field-label" htmlFor="marker-type">
                {t.map.markerType}
              </label>
              <select
                id="marker-type"
                className="field"
                value={selected.type}
                disabled={!canManage}
                onChange={(e) => update(selected.id, { type: e.target.value })}
              >
                {MARKER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t.enums.markerType[type]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label" htmlFor="marker-description">
                {t.common.description}
              </label>
              <textarea
                id="marker-description"
                rows={2}
                className="field"
                value={selected.description ?? ''}
                disabled={!canManage}
                onChange={(e) =>
                  update(selected.id, { description: e.target.value || null })
                }
              />
            </div>

            <div>
              <label className="field-label" htmlFor="marker-link">
                {t.map.linkedEntity}
              </label>
              <select
                id="marker-link"
                className="field"
                value={linkKind}
                disabled={!canManage}
                onChange={(e) => {
                  const kind = e.target.value;
                  update(selected.id, {
                    gateId: null,
                    workingPointId: null,
                    eventMemberId: null,
                    ...(kind === 'GATE' && gates[0] ? { gateId: gates[0].id } : {}),
                    ...(kind === 'WORKING_POINT' && workingPoints[0]
                      ? { workingPointId: workingPoints[0].id }
                      : {}),
                    ...(kind === 'MEMBER' && members[0]
                      ? { eventMemberId: members[0].id }
                      : {}),
                  });
                }}
              >
                <option value="NONE">{t.map.linkNone}</option>
                <option value="GATE">{t.map.linkGate}</option>
                <option value="WORKING_POINT">{t.map.linkWorkingPoint}</option>
                <option value="MEMBER">{t.map.linkMember}</option>
              </select>
            </div>

            {linkKind === 'GATE' ? (
              <select
                className="field"
                value={selected.gateId ?? ''}
                disabled={!canManage}
                onChange={(e) => update(selected.id, { gateId: e.target.value || null })}
                aria-label={t.map.linkGate}
              >
                <option value="">{t.common.selectPlaceholder}</option>
                {gates.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            ) : null}

            {linkKind === 'WORKING_POINT' ? (
              <select
                className="field"
                value={selected.workingPointId ?? ''}
                disabled={!canManage}
                onChange={(e) =>
                  update(selected.id, { workingPointId: e.target.value || null })
                }
                aria-label={t.map.linkWorkingPoint}
              >
                <option value="">{t.common.selectPlaceholder}</option>
                {workingPoints.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            ) : null}

            {linkKind === 'MEMBER' ? (
              <select
                className="field"
                value={selected.eventMemberId ?? ''}
                disabled={!canManage}
                onChange={(e) =>
                  update(selected.id, { eventMemberId: e.target.value || null })
                }
                aria-label={t.map.linkMember}
              >
                <option value="">{t.common.selectPlaceholder}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            ) : null}

            <div className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
              <p className="text-[12.5px] text-ink-500">{t.map.position}</p>
              <p className="nums mt-0.5 text-[13px] text-ink-200">
                x {selected.x.toFixed(3)} · y {selected.y.toFixed(3)}
              </p>
            </div>

            {canManage ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" className="btn-secondary btn-sm" onClick={duplicate}>
                  <IconCopy width={15} height={15} />
                  {t.map.duplicateMarker}
                </button>
                <button type="button" className="btn-danger btn-sm" onClick={remove}>
                  <IconTrash width={15} height={15} />
                  {t.common.delete}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </aside>
    </div>
  );
}
