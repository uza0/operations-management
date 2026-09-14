import 'server-only';

import { and, eq, ne } from 'drizzle-orm';

import { db } from '@/db';
import { assignments, gates, workingPoints } from '@/db/schema';
import { staffingLevel, type StaffingLevel } from '@/lib/constants';

export type StaffedLocation = {
  id: string;
  kind: 'GATE' | 'WORKING_POINT';
  name: string;
  type: string;
  status: string;
  description: string | null;
  capacity: number | null;
  requiredStaff: number;
  assignedStaff: number;
  /** requiredStaff - assignedStaff; positive means the location is short. */
  difference: number;
  level: StaffingLevel;
  gateLeaderId?: string | null;
  sortOrder: number;
};

/**
 * Required - Assigned = the number the Team Leader actually needs to see
 * (spec §9). Cancelled assignments never count toward staffing.
 */
export async function getStaffedLocations(eventId: string): Promise<StaffedLocation[]> {
  const [gateRows, wpRows, activeAssignments] = await Promise.all([
    db.query.gates.findMany({
      where: eq(gates.eventId, eventId),
    }),
    db.query.workingPoints.findMany({
      where: eq(workingPoints.eventId, eventId),
    }),
    db
      .select({
        gateId: assignments.gateId,
        workingPointId: assignments.workingPointId,
      })
      .from(assignments)
      .where(
        and(eq(assignments.eventId, eventId), ne(assignments.status, 'CANCELLED')),
      ),
  ]);

  const gateCounts = new Map<string, number>();
  const wpCounts = new Map<string, number>();
  for (const row of activeAssignments) {
    if (row.gateId) gateCounts.set(row.gateId, (gateCounts.get(row.gateId) ?? 0) + 1);
    if (row.workingPointId)
      wpCounts.set(row.workingPointId, (wpCounts.get(row.workingPointId) ?? 0) + 1);
  }

  const mapped: StaffedLocation[] = [
    ...gateRows.map((g) => {
      const assigned = gateCounts.get(g.id) ?? 0;
      return {
        id: g.id,
        kind: 'GATE' as const,
        name: g.name,
        type: g.type,
        status: g.status,
        description: g.description,
        capacity: g.capacity,
        requiredStaff: g.requiredStaff,
        assignedStaff: assigned,
        difference: g.requiredStaff - assigned,
        level: staffingLevel(assigned, g.requiredStaff),
        gateLeaderId: g.gateLeaderId,
        sortOrder: g.sortOrder,
      };
    }),
    ...wpRows.map((w) => {
      const assigned = wpCounts.get(w.id) ?? 0;
      return {
        id: w.id,
        kind: 'WORKING_POINT' as const,
        name: w.name,
        type: w.type,
        status: w.status,
        description: w.description,
        capacity: null,
        requiredStaff: w.requiredStaff,
        assignedStaff: assigned,
        difference: w.requiredStaff - assigned,
        level: staffingLevel(assigned, w.requiredStaff),
        sortOrder: w.sortOrder,
      };
    }),
  ];

  return mapped.sort((a, b) =>
    a.kind === b.kind
      ? a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
      : a.kind === 'GATE'
        ? -1
        : 1,
  );
}

export function summarizeStaffing(locations: StaffedLocation[]) {
  return {
    required: locations.reduce((n, l) => n + l.requiredStaff, 0),
    assigned: locations.reduce((n, l) => n + l.assignedStaff, 0),
    understaffed: locations.filter((l) => l.level === 'UNDERSTAFFED'),
    overstaffed: locations.filter((l) => l.level === 'OVERSTAFFED'),
  };
}
