import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventMembers, gates, teamMembers, workingPoints } from '@/db/schema';
import { loadEventPage } from '@/features/event/workspace';
import { getStaffedLocations } from '@/server/services/staffing';
import { PageHeader } from '@/components/ui/panel';

import { GateManager } from './parts/GateManager';

export async function EventGatesPage({
  base,
  eventId,
}: {
  base: '/admin' | '/leader';
  eventId: string;
}) {
  const { scope, t } = await loadEventPage(eventId);

  const [locations, gateRows, wpRows, memberRows] = await Promise.all([
    getStaffedLocations(eventId),
    db.select().from(gates).where(eq(gates.eventId, eventId)),
    db.select().from(workingPoints).where(eq(workingPoints.eventId, eventId)),
    db
      .select({ id: eventMembers.id, name: teamMembers.fullName })
      .from(eventMembers)
      .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
      .where(eq(eventMembers.eventId, eventId)),
  ]);

  const leaderNames: Record<string, string> = {};
  for (const member of memberRows) leaderNames[member.id] = member.name;

  // A gate leader sees only their own gate (spec §3.3).
  const visible = scope.gateId
    ? locations.filter((l) => l.id === scope.gateId)
    : locations;

  return (
    <>
      <PageHeader title={t.gate.title} subtitle={t.gate.subtitle} />
      <GateManager
        t={t}
        eventId={eventId}
        locations={visible}
        gates={gateRows.map((g) => ({
          id: g.id,
          name: g.name,
          type: g.type,
          description: g.description,
          capacity: g.capacity,
          requiredStaff: g.requiredStaff,
          status: g.status,
          gateLeaderId: g.gateLeaderId,
        }))}
        workingPoints={wpRows.map((w) => ({
          id: w.id,
          name: w.name,
          type: w.type,
          description: w.description,
          requiredStaff: w.requiredStaff,
          status: w.status,
        }))}
        members={memberRows}
        leaderNames={leaderNames}
        canManage={scope.canManage}
        assignHref={`${base}/events/${eventId}/assignments`}
      />
    </>
  );
}
