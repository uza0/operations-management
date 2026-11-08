import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventMembers, gates, mapMarkers, teamMembers, workingPoints } from '@/db/schema';
import { loadEventPage } from '@/features/event/workspace';
import { PageHeader, Panel } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/states';
import { IconMap } from '@/components/ui/icons';
import { MARKER_STYLE, MARKER_TYPES } from '@/lib/constants';
import { MapEditor } from '@/components/map/MapEditor';
import { DictionaryProvider } from '@/components/ui/client';
import { EventMapSourceManager } from './parts/EventMapSourceManager';
import { MapSourcePreview } from '@/components/map/MapSourcePreview';

export async function EventMapPage({ eventId }: { eventId: string }) {
  const { scope, event, t } = await loadEventPage(eventId);

  const imageUrl =
    event.mapImageUrl ??
    (event.mapDocumentUrl || event.mapLinkUrl ? null : event.venue.mapImageUrl);
  const activeSource = event.mapLinkUrl
    ? 'link'
    : event.mapDocumentUrl
      ? 'pdf'
      : imageUrl
        ? 'image'
        : 'none';

  const [markerRows, gateRows, wpRows, memberRows] = await Promise.all([
    db.select().from(mapMarkers).where(eq(mapMarkers.eventId, eventId)),
    db
      .select({ id: gates.id, name: gates.name })
      .from(gates)
      .where(eq(gates.eventId, eventId)),
    db
      .select({ id: workingPoints.id, name: workingPoints.name })
      .from(workingPoints)
      .where(eq(workingPoints.eventId, eventId)),
    db
      .select({ id: eventMembers.id, name: teamMembers.fullName })
      .from(eventMembers)
      .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
      .where(eq(eventMembers.eventId, eventId)),
  ]);

  const usedTypes = MARKER_TYPES.filter((type) =>
    markerRows.some((m) => m.type === type),
  );

  return (
    <DictionaryProvider dict={t}>
      <PageHeader
        title={t.map.title}
        subtitle={`${t.map.subtitle} · ${event.venue.name}`}
      />

      {scope.canManage ? (
        <EventMapSourceManager
          eventId={eventId}
          initialSource={activeSource}
          linkUrl={event.mapLinkUrl}
        />
      ) : null}

      {!imageUrl && (event.mapDocumentUrl || event.mapLinkUrl) ? (
        <MapSourcePreview
          title={t.map.mapPreviewTitle}
          fileUrl={event.mapDocumentUrl}
          linkUrl={event.mapLinkUrl}
          openLinkLabel={t.map.openMapLink}
          downloadLabel={t.map.downloadMapPdf}
          fallback={t.map.mapEmbedFallback}
        />
      ) : !imageUrl ? (
        <Panel bodyClassName="p-0">
          <EmptyState
            title={t.map.noMap}
            hint={t.map.noMapHint}
            icon={<IconMap width={20} height={20} />}
          />
        </Panel>
      ) : (
        <>
          <MapEditor
            t={t}
            eventId={eventId}
            imageUrl={imageUrl}
            initialMarkers={markerRows.map((m) => ({
              id: m.id,
              type: m.type,
              name: m.name,
              description: m.description,
              x: m.x,
              y: m.y,
              gateId: m.gateId,
              workingPointId: m.workingPointId,
              eventMemberId: m.eventMemberId,
            }))}
            gates={gateRows}
            workingPoints={wpRows}
            members={memberRows}
            canManage={scope.canManage}
          />

          {usedTypes.length > 0 ? (
            <div className="panel mt-4 p-4">
              <p className="mb-2.5 text-[12.5px] font-semibold uppercase tracking-wide text-ink-500">
                {t.map.legend}
              </p>
              <ul className="flex flex-wrap gap-x-5 gap-y-2">
                {usedTypes.map((type) => (
                  <li key={type} className="flex items-center gap-2 text-[13px] text-ink-300">
                    <span
                      aria-hidden
                      className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-ink-950"
                      style={{ background: MARKER_STYLE[type].color }}
                    >
                      {MARKER_STYLE[type].glyph}
                    </span>
                    {t.enums.markerType[type]}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </DictionaryProvider>
  );
}
