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
import { newId } from '../lib/ids';
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
  await db
    .insert(teamMembers)
    .values(
      TEAM_ROSTER.map((person) => ({
        id: newId(),
        fullName: person.name,
        phone: person.phone,
        employeeCode: person.code,
        active: true,
        notes: null,
      })),
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
  await db
    .insert(users)
    .values([
      {
        id: newId(),
        username: adminUsername,
        email: 'admin@operations.local',
        name: 'مشرف العمليات',
        passwordHash: bcrypt.hashSync(adminPassword, 10),
        role: 'ADMIN' as const,
        active: true,
        teamMemberId: null,
      },
      {
        id: newId(),
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

  return {
    adminUsername,
    adminPassword,
    leaderUsername,
    leaderPassword,
    gateUsername,
    gatePassword,
    teamSize: TEAM_ROSTER.length,
  };
}
