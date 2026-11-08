import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { mapMarkers } from '@/db/schema';
import { loadEventPage } from '@/features/event/workspace';
import {
  listAssignableMembers,
  listAssignments,
} from '@/server/services/assignments';
import { getStaffedLocations } from '@/server/services/staffing';
import { PageHeader } from '@/components/ui/panel';

import { AssignmentBoard } from './parts/AssignmentBoard';

export async function EventAssignmentsPage({ eventId }: { eventId: string }) {
  const { scope, event, locale, t } = await loadEventPage(eventId);

  const [assignments, locations, members, markers] = await Promise.all([
    listAssignments(eventId),
    getStaffedLocations(eventId),
    listAssignableMembers(eventId),
    db
      .select({
        id: mapMarkers.id,
        type: mapMarkers.type,
        name: mapMarkers.name,
        x: mapMarkers.x,
        y: mapMarkers.y,
        gateId: mapMarkers.gateId,
        workingPointId: mapMarkers.workingPointId,
      })
      .from(mapMarkers)
      .where(eq(mapMarkers.eventId, eventId)),
  ]);

  // A gate leader only ever sees their own gate's people (spec §3.3).
  const scoped = scope.gateId
    ? assignments.filter((a) => a.gateId === scope.gateId)
    : assignments;
  const scopedLocations = scope.gateId
    ? locations.filter((l) => l.id === scope.gateId)
    : locations;

  return (
    <>
      <PageHeader title={t.assignment.title} subtitle={t.assignment.subtitle} />
      <AssignmentBoard
        t={t}
        locale={locale}
        eventId={eventId}
        assignments={scoped}
        locations={scopedLocations}
        members={members}
        markers={markers}
        mapImageUrl={
          event.mapImageUrl ??
          (event.mapDocumentUrl || event.mapLinkUrl ? null : event.venue.mapImageUrl)
        }
        mapDocumentUrl={event.mapDocumentUrl}
        mapLinkUrl={event.mapLinkUrl}
        defaultArrival={event.teamArrivalTime}
        defaultDeparture={event.teamDepartureTime}
        canManage={scope.canManage}
      />
    </>
  );
}
