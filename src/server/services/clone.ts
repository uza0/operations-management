import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  assignments,
  eventMembers,
  events,
  gates,
  mapMarkers,
  timelineItems,
  workingPoints,
} from '@/db/schema';
import { newId, newMemberToken } from '@/lib/ids';

/**
 * Building a new event out of one that already happened.
 *
 * Most events at a venue are the same event again: the same gates, the same
 * staff numbers, the same people standing in the same places. Re-entering all
 * of that is where the mistakes come from — a gate quietly left out, a count
 * typed wrong — so the answer is to copy last time and change what differs.
 *
 * What is copied is the PLAN, never the RECORD. Gates, working points, who is
 * on the team, where each person stands, the schedule and the map markers all
 * come across. Attendance, issues, announcements, assignment history and the
 * report do not: those describe a day that happened, and carrying them into a
 * day that has not happened yet would be inventing facts.
 *
 * Member links are new. A token is a key to one person's page for one event;
 * reusing it would hand the new event to anyone holding last month's message.
 */

export type CloneResult = {
  gates: number;
  workingPoints: number;
  members: number;
  assignments: number;
  timeline: number;
  markers: number;
  /** True when the source had a map of its own that came across. */
  mapImage: boolean;
};

export async function cloneEventPlan(
  sourceEventId: string,
  targetEventId: string,
  options: {
    /** The new event's own hours — every copied assignment adopts them. */
    arrivalTime: string;
    departureTime: string | null;
    /** False leaves the new event with its locations but no people yet. */
    withTeam: boolean;
    withTimeline: boolean;
    createdById: string | null;
  },
): Promise<CloneResult> {
  const [sourceEvent, sourceGates, sourcePoints] = await Promise.all([
    db.query.events.findFirst({ where: eq(events.id, sourceEventId) }),
    db.select().from(gates).where(eq(gates.eventId, sourceEventId)),
    db.select().from(workingPoints).where(eq(workingPoints.eventId, sourceEventId)),
  ]);

  /*
   * A map uploaded for one event belongs to the plan, not to the day: markers
   * are placed against it, so carrying them over without it would leave every
   * position pointing at a different picture. An event with no map of its own
   * falls back to the venue's, which the new event shares anyway.
   */
  if (sourceEvent?.mapImageUrl) {
    await db
      .update(events)
      .set({ mapImageUrl: sourceEvent.mapImageUrl, updatedAt: new Date() })
      .where(eq(events.id, targetEventId));
  }

  // Old id → new id, so assignments and markers can be re-pointed.
  const gateMap = new Map<string, string>();
  const pointMap = new Map<string, string>();

  if (sourceGates.length > 0) {
    await db.insert(gates).values(
      sourceGates.map((gate) => {
        const id = newId();
        gateMap.set(gate.id, id);
        return {
          id,
          eventId: targetEventId,
          name: gate.name,
          type: gate.type,
          description: gate.description,
          capacity: gate.capacity,
          requiredStaff: gate.requiredStaff,
          // How the gate is divided is part of the plan, so it travels too.
          lanes: gate.lanes,
          // A fresh event opens with its gates not yet live.
          status: 'INACTIVE' as const,
          // Gate leaders point at an event member of the OLD event.
          gateLeaderId: null,
          sortOrder: gate.sortOrder,
        };
      }),
    );
  }

  if (sourcePoints.length > 0) {
    await db.insert(workingPoints).values(
      sourcePoints.map((point) => {
        const id = newId();
        pointMap.set(point.id, id);
        return {
          id,
          eventId: targetEventId,
          name: point.name,
          type: point.type,
          description: point.description,
          requiredStaff: point.requiredStaff,
          lanes: point.lanes,
          status: 'INACTIVE' as const,
          sortOrder: point.sortOrder,
        };
      }),
    );
  }

  const memberMap = new Map<string, string>();
  let assignmentCount = 0;

  if (options.withTeam) {
    const sourceMembers = await db
      .select()
      .from(eventMembers)
      .where(eq(eventMembers.eventId, sourceEventId));

    const carried = sourceMembers.filter((m) => m.status !== 'CANCELLED');
    if (carried.length > 0) {
      await db.insert(eventMembers).values(
        carried.map((member) => {
          const id = newId();
          memberMap.set(member.id, id);
          return {
            id,
            eventId: targetEventId,
            teamMemberId: member.teamMemberId,
            status: 'INVITED' as const,
            // A new key for a new event — see the note at the top.
            token: newMemberToken(),
            tokenExpiresAt: null,
            isReserve: member.isReserve,
            notifiedAt: null,
            notifiedById: null,
            // Credit is a decision about one day's work, not a standing rate.
            creditDays: null,
            creditNote: null,
          };
        }),
      );
    }

    const sourceAssignments = await db
      .select()
      .from(assignments)
      .where(eq(assignments.eventId, sourceEventId));

    const rows = sourceAssignments
      .filter((a) => a.status !== 'CANCELLED')
      .map((a) => {
        const eventMemberId = memberMap.get(a.eventMemberId);
        const gateId = a.gateId ? (gateMap.get(a.gateId) ?? null) : null;
        const workingPointId = a.workingPointId
          ? (pointMap.get(a.workingPointId) ?? null)
          : null;
        if (!eventMemberId || (!gateId && !workingPointId)) return null;
        return {
          id: newId(),
          eventId: targetEventId,
          eventMemberId,
          gateId,
          workingPointId,
          task: a.task,
          // The new event's hours, not last time's.
          arrivalTime: options.arrivalTime,
          shiftStart: options.arrivalTime,
          shiftEnd: options.departureTime ?? a.shiftEnd,
          isGateLeader: a.isGateLeader,
          notes: a.notes,
          status: 'ASSIGNED' as const,
          createdById: options.createdById,
          updatedById: options.createdById,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (rows.length > 0) {
      await db.insert(assignments).values(rows);
      assignmentCount = rows.length;
    }
  }

  let timelineCount = 0;
  if (options.withTimeline) {
    const sourceTimeline = await db
      .select()
      .from(timelineItems)
      .where(eq(timelineItems.eventId, sourceEventId));
    if (sourceTimeline.length > 0) {
      await db.insert(timelineItems).values(
        sourceTimeline.map((item) => ({
          id: newId(),
          eventId: targetEventId,
          title: item.title,
          description: item.description,
          scheduledTime: item.scheduledTime,
          // Nothing has happened yet on the new day.
          status: 'UPCOMING' as const,
          sortOrder: item.sortOrder,
        })),
      );
      timelineCount = sourceTimeline.length;
    }
  }

  /*
   * Markers are the reason a cloned event is worth having: the gate positions
   * on the venue photo are the slowest thing to place by hand. Only markers
   * that point at something carried across are copied — a marker for a member
   * is dropped when the team was not.
   */
  const sourceMarkers = await db
    .select()
    .from(mapMarkers)
    .where(eq(mapMarkers.eventId, sourceEventId));

  const markerRows = sourceMarkers
    .map((marker) => {
      const gateId = marker.gateId ? (gateMap.get(marker.gateId) ?? null) : null;
      const workingPointId = marker.workingPointId
        ? (pointMap.get(marker.workingPointId) ?? null)
        : null;
      const eventMemberId = marker.eventMemberId
        ? (memberMap.get(marker.eventMemberId) ?? null)
        : null;
      const pointedAtSomething =
        Boolean(marker.gateId) || Boolean(marker.workingPointId) || Boolean(marker.eventMemberId);
      const stillPoints = Boolean(gateId || workingPointId || eventMemberId);
      if (pointedAtSomething && !stillPoints) return null;
      return {
        id: newId(),
        eventId: targetEventId,
        type: marker.type,
        name: marker.name,
        description: marker.description,
        x: marker.x,
        y: marker.y,
        gateId,
        workingPointId,
        eventMemberId,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (markerRows.length > 0) await db.insert(mapMarkers).values(markerRows);

  return {
    gates: sourceGates.length,
    workingPoints: sourcePoints.length,
    members: memberMap.size,
    assignments: assignmentCount,
    timeline: timelineCount,
    markers: markerRows.length,
    mapImage: Boolean(sourceEvent?.mapImageUrl),
  };
}
