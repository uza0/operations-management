/**
 * The live install: the real team, and nothing else.
 *
 * Where seed-core.ts builds a full demonstration (a match in progress, eight
 * gates, invented people and a finished report), this one prepares the system
 * for actual use. It clears every table and writes back only what cannot be
 * created from inside the app:
 *
 *   • the sign-in accounts, since the app has no screen for creating users
 *   • the operations roster from roster.ts
 *
 * Everything else — venues, events, gates, assignments — is the supervisor's
 * to create, and starting empty is the point: nothing invented is left behind
 * to be mistaken later for a real record.
 *
 * Called two ways, with the same result:
 *   • `npm run db:seed:live`
 *   • the setup route with `&reset=1` (src/app/api/setup/route.ts)
 */
import bcrypt from 'bcryptjs';

import * as schema from './schema';
import { TEAM_ROSTER } from './roster';
import { LIVE_EVENT, LIVE_PLAN, LIVE_VENUE } from './live-event';
import { newId, newMemberToken } from '../lib/ids';
import type { SeedContext } from './seed-core';

const {
  users,
  eventAccess,
  teamMembers,
  venues,
  events,
  eventMembers,
  gates,
  workingPoints,
  assignments,
  assignmentChanges,
  attendance,
  announcements,
  issues,
  timelineItems,
  mapMarkers,
  auditLogs,
} = schema;

export type LiveSeedResult = {
  adminUsername: string;
  adminPassword: string;
  leaderUsername: string;
  leaderPassword: string;
  gateUsername: string;
  gatePassword: string;
  teamSize: number;
  eventName: string;
  locations: number;
  assigned: number;
};

export async function seedLiveData(ctx: SeedContext): Promise<LiveSeedResult> {
  const { db } = ctx;

  console.log('› clearing…');
  // Children before parents: foreign keys may or may not be enforced on the
  // host, and an order that is correct either way costs nothing.
  for (const table of [
    auditLogs,
    mapMarkers,
    timelineItems,
    issues,
    announcements,
    attendance,
    assignmentChanges,
    assignments,
    workingPoints,
    gates,
    eventMembers,
    eventAccess,
    events,
    venues,
    users,
    teamMembers,
  ]) {
    await db.delete(table).run();
  }

  console.log(`› team (${TEAM_ROSTER.length})…`);
  const personIdByCode = new Map<string, string>();
  await db
    .insert(teamMembers)
    .values(
      TEAM_ROSTER.map((person) => {
        const id = newId();
        personIdByCode.set(person.code, id);
        return {
          id,
          fullName: person.name,
          phone: person.phone,
          employeeCode: person.code,
          active: true,
          notes: null,
        };
      }),
    )
    .run();

  console.log('› accounts…');
  const adminUsername = process.env.SEED_ADMIN_USERNAME ?? 'admin';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
  const leaderUsername = process.env.SEED_LEADER_USERNAME ?? 'leader';
  const leaderPassword = process.env.SEED_LEADER_PASSWORD ?? 'Leader@12345';
  const gateUsername = process.env.SEED_GATELEADER_USERNAME ?? 'gate';
  const gatePassword = process.env.SEED_GATELEADER_PASSWORD ?? 'Gate@12345';

  /*
   * The two non-admin accounts are deliberately not tied to anyone on the
   * roster. Who leads a team or a gate is decided per event, and binding an
   * account to a person here would be a guess that outlives the guessing.
   */
  const adminId = newId();
  const leaderId = newId();
  await db
    .insert(users)
    .values([
      {
        id: adminId,
        username: adminUsername,
        email: 'admin@operations.local',
        name: 'مشرف العمليات',
        passwordHash: bcrypt.hashSync(adminPassword, 10),
        role: 'ADMIN' as const,
        active: true,
        teamMemberId: null,
      },
      {
        id: leaderId,
        username: leaderUsername,
        email: 'leader@operations.local',
        name: 'قائد الفريق',
        passwordHash: bcrypt.hashSync(leaderPassword, 10),
        role: 'TEAM_LEADER' as const,
        active: true,
        teamMemberId: null,
      },
      {
        id: newId(),
        username: gateUsername,
        email: 'gate@operations.local',
        name: 'قائد بوابة',
        passwordHash: bcrypt.hashSync(gatePassword, 10),
        role: 'GATE_LEADER' as const,
        active: true,
        teamMemberId: null,
      },
    ])
    .run();

  /* ---- the venue and the match ------------------------------------------ */

  console.log('› venue…');
  const venueId = newId();
  await db.insert(venues).values({ id: venueId, ...LIVE_VENUE }).run();

  console.log(`› event — ${LIVE_EVENT.name}…`);
  const eventId = newId();
  await db
    .insert(events)
    .values({
      id: eventId,
      name: LIVE_EVENT.name,
      type: LIVE_EVENT.type,
      venueId,
      date: LIVE_EVENT.date,
      startTime: LIVE_EVENT.startTime,
      teamArrivalTime: LIVE_EVENT.teamArrivalTime,
      teamDepartureTime: LIVE_EVENT.shiftEnd,
      description: LIVE_EVENT.description,
      status: LIVE_EVENT.status,
      mapImageUrl: LIVE_VENUE.mapImageUrl,
      reportNotes: null,
      createdById: adminId,
    })
    .run();

  // The team leader account can only reach events it has a row for.
  await db
    .insert(eventAccess)
    .values({ id: newId(), eventId, userId: leaderId, role: 'TEAM_LEADER', gateId: null })
    .run();

  /*
   * Locations first, then the people on them. Every location carries the staff
   * number the printed board asked for, so the app's own "required − assigned"
   * arithmetic reproduces the board rather than restating it.
   */
  console.log(`› gates and points (${LIVE_PLAN.length})…`);
  const locationIdByName = new Map<string, { gateId: string | null; pointId: string | null }>();
  for (const location of LIVE_PLAN) {
    const id = newId();
    if (location.kind === 'GATE') {
      await db
        .insert(gates)
        .values({
          id,
          eventId,
          name: location.name,
          type: location.gateType ?? 'GENERAL',
          description: null,
          capacity: null,
          requiredStaff: location.requiredStaff,
          status: 'READY',
          gateLeaderId: null,
          sortOrder: location.sortOrder,
          // The board's columns come straight from the printed plan.
          lanes: JSON.stringify(location.teams.map((team) => team.task)),
        })
        .run();
      locationIdByName.set(location.name, { gateId: id, pointId: null });
    } else {
      await db
        .insert(workingPoints)
        .values({
          id,
          eventId,
          name: location.name,
          type: location.pointType ?? 'OTHER',
          description: null,
          requiredStaff: location.requiredStaff,
          status: 'READY',
          sortOrder: location.sortOrder,
          lanes: JSON.stringify(location.teams.map((team) => team.task)),
        })
        .run();
      locationIdByName.set(location.name, { gateId: null, pointId: id });
    }
  }

  console.log('› assignments…');
  const memberRows: (typeof eventMembers.$inferInsert)[] = [];
  const assignmentRows: (typeof assignments.$inferInsert)[] = [];

  for (const location of LIVE_PLAN) {
    const where = locationIdByName.get(location.name)!;
    for (const team of location.teams) {
      for (const code of team.codes) {
        const teamMemberId = personIdByCode.get(code);
        if (!teamMemberId) {
          // A plan that names someone who is not on the roster is a mistake
          // worth stopping for: the alternative is a gate quietly one short.
          throw new Error(`${location.name}: no roster entry for ${code}`);
        }
        const eventMemberId = newId();
        memberRows.push({
          id: eventMemberId,
          eventId,
          teamMemberId,
          status: 'ACTIVE',
          token: newMemberToken(),
          tokenExpiresAt: null,
          isReserve: false,
          notifiedAt: null,
          notifiedById: null,
        });
        assignmentRows.push({
          id: newId(),
          eventId,
          eventMemberId,
          gateId: where.gateId,
          workingPointId: where.pointId,
          task: team.task,
          arrivalTime: LIVE_EVENT.teamArrivalTime,
          shiftStart: LIVE_EVENT.teamArrivalTime,
          shiftEnd: LIVE_EVENT.shiftEnd,
          isGateLeader: false,
          notes: null,
          status: 'ASSIGNED',
          createdById: adminId,
          updatedById: adminId,
        });
      }
    }
  }

  await db.insert(eventMembers).values(memberRows).run();
  await db.insert(assignments).values(assignmentRows).run();

  return {
    adminUsername,
    adminPassword,
    leaderUsername,
    leaderPassword,
    gateUsername,
    gatePassword,
    teamSize: TEAM_ROSTER.length,
    eventName: LIVE_EVENT.name,
    locations: LIVE_PLAN.length,
    assigned: assignmentRows.length,
  };
}
