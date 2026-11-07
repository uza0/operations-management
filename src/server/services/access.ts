import { and, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { eventAccess, users } from '@/db/schema';
import { newId } from '@/lib/ids';

/**
 * Who leads what, for one event.
 *
 * The account's own role says what kind of person somebody is; it does not say
 * what they are doing on a given night. A supervisor who runs Thursday's match
 * himself is that match's team leader, and the same man may be posted to one
 * gate on Saturday. So the question "who leads this event" is answered here,
 * per event, in `event_access` — never by reading `users.role`.
 */

/** Everyone who may be put in charge of an event or a gate, for a picker. */
export async function leadershipCandidates() {
  const rows = await db
    .select({ id: users.id, name: users.name, username: users.username, role: users.role })
    .from(users)
    .where(
      and(
        eq(users.active, true),
        inArray(users.role, ['ADMIN', 'TEAM_LEADER', 'GATE_LEADER']),
      ),
    );

  /*
   * Sorted by name in Arabic rather than by the database's byte order, and
   * carrying the username: two accounts have been called "قائد الفريق" since
   * the system was seeded, and a picker that shows the name alone offers two
   * identical lines and no way to tell them apart.
   */
  return rows
    .map((row) => ({ ...row, label: `${row.name} — ${row.username}` }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

/** The user leading this event, or null. */
export async function eventTeamLeaderId(eventId: string): Promise<string | null> {
  return (await eventTeamLeaderIds(eventId))[0] ?? null;
}

/** Every team-leader account granted access to this event. */
export async function eventTeamLeaderIds(eventId: string): Promise<string[]> {
  const row = await db
    .select({ userId: eventAccess.userId })
    .from(eventAccess)
    .where(
      and(
        eq(eventAccess.eventId, eventId),
        eq(eventAccess.role, 'TEAM_LEADER'),
        isNull(eventAccess.gateId),
      ),
    )
    .all();
  return row.map((entry) => entry.userId);
}

export type LeaderChange =
  | { changed: false }
  | { changed: true; from: string | null; to: string | null };

/**
 * Puts a person in charge of an event, moves the job to somebody else, or
 * leaves it vacant — whichever the one argument says.
 *
 * Idempotent on purpose: the edit form sends the field on every save, and
 * re-saving a name that is already there must not pile up grants. Returns
 * whether anything moved so the caller can decide what to write in the audit.
 */
export async function setEventTeamLeader(
  eventId: string,
  userId: string | null,
): Promise<LeaderChange> {
  const current = await eventTeamLeaderId(eventId);
  if (current === userId) return { changed: false };

  await db
    .delete(eventAccess)
    .where(
      and(
        eq(eventAccess.eventId, eventId),
        eq(eventAccess.role, 'TEAM_LEADER'),
        isNull(eventAccess.gateId),
      ),
    );

  if (userId) {
    await db.insert(eventAccess).values({
      id: newId(),
      eventId,
      userId,
      role: 'TEAM_LEADER',
      gateId: null,
    });
  }

  return { changed: true, from: current, to: userId };
}

/** Replaces the event's team-leader grants with the selected accounts. */
export async function setEventTeamLeaders(eventId: string, userIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  await db
    .delete(eventAccess)
    .where(
      and(
        eq(eventAccess.eventId, eventId),
        eq(eventAccess.role, 'TEAM_LEADER'),
        isNull(eventAccess.gateId),
      ),
    );
  if (uniqueIds.length) {
    await db.insert(eventAccess).values(
      uniqueIds.map((userId) => ({
        id: newId(),
        eventId,
        userId,
        role: 'TEAM_LEADER',
        gateId: null,
      })),
    );
  }
}

/** The user in charge of each gate of this event, keyed by gate id. */
export async function gateLeaderIds(eventId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ gateId: eventAccess.gateId, userId: eventAccess.userId })
    .from(eventAccess)
    .where(and(eq(eventAccess.eventId, eventId), eq(eventAccess.role, 'GATE_LEADER')));

  const byGate: Record<string, string> = {};
  for (const row of rows) if (row.gateId) byGate[row.gateId] = row.userId;
  return byGate;
}

/**
 * Puts a person in charge of one gate.
 *
 * Deliberately separate from `assignments.isGateLeader`, which marks a member
 * of the crew standing at that gate. This one is an account that signs in and
 * approves arrivals; that one is a man on the ground. They are often different
 * people, and conflating them was never going to end well.
 */
export async function setGateLeader(
  eventId: string,
  gateId: string,
  userId: string | null,
): Promise<LeaderChange> {
  const current = await db
    .select({ userId: eventAccess.userId })
    .from(eventAccess)
    .where(
      and(
        eq(eventAccess.eventId, eventId),
        eq(eventAccess.role, 'GATE_LEADER'),
        eq(eventAccess.gateId, gateId),
      ),
    )
    .get();

  const from = current?.userId ?? null;
  if (from === userId) return { changed: false };

  await db
    .delete(eventAccess)
    .where(
      and(
        eq(eventAccess.eventId, eventId),
        eq(eventAccess.role, 'GATE_LEADER'),
        eq(eventAccess.gateId, gateId),
      ),
    );

  if (userId) {
    await db.insert(eventAccess).values({
      id: newId(),
      eventId,
      userId,
      role: 'GATE_LEADER',
      gateId,
    });
  }

  return { changed: true, from, to: userId };
}
