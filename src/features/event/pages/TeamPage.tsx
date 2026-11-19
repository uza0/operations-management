import { headers } from 'next/headers';
import { and, eq, ne } from 'drizzle-orm';
import QRCode from 'qrcode';

import { db } from '@/db';
import {
  assignments,
  eventMembers,
  events,
  gates,
  seatSetupMembers,
  teamMembers,
  workingPoints,
} from '@/db/schema';
import { loadEventPage } from '@/features/event/workspace';
import { PageHeader } from '@/components/ui/panel';

import { buildInvitationBoard } from '@/server/services/journey';

import { EventTeamManager } from './parts/EventTeamManager';
import { InvitationBoard } from './parts/InvitationBoard';
import { byName } from '@/lib/sort';

async function resolveBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, '');
  const store = await headers();
  const host = store.get('x-forwarded-host') ?? store.get('host') ?? 'localhost:3000';
  const proto = store.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

export async function EventTeamPage({ eventId }: { eventId: string }) {
  const { scope, event, locale, t } = await loadEventPage(eventId);
  const baseUrl = await resolveBaseUrl();
  const invitations = await buildInvitationBoard(eventId);

  const rows = await db
    .select({
      id: eventMembers.id,
      name: teamMembers.fullName,
      employeeCode: teamMembers.employeeCode,
      phone: teamMembers.phone,
      status: eventMembers.status,
      isReserve: eventMembers.isReserve,
      token: eventMembers.token,
      gateName: gates.name,
      workingPointName: workingPoints.name,
      assignmentGateId: assignments.gateId,
    })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .leftJoin(
      assignments,
      and(
        eq(assignments.eventMemberId, eventMembers.id),
        ne(assignments.status, 'CANCELLED'),
      ),
    )
    .leftJoin(gates, eq(assignments.gateId, gates.id))
    .leftJoin(workingPoints, eq(assignments.workingPointId, workingPoints.id))
    .where(eq(eventMembers.eventId, eventId));

  // Gate leaders only see the people working their own gate (spec §3.3).
  const scoped = scope.gateId
    ? rows.filter((r) => r.assignmentGateId === scope.gateId)
    : rows;

  // Who is on the chair crew, and for how many days — shown as a mark by the name.
  const seatRows = await db
    .select({
      eventMemberId: seatSetupMembers.eventMemberId,
      declinedAt: seatSetupMembers.declinedAt,
    })
    .from(seatSetupMembers)
    .where(eq(seatSetupMembers.eventId, eventId));
  const seatDays = new Map<string, number>();
  for (const r of seatRows) {
    if (r.declinedAt) continue;
    seatDays.set(r.eventMemberId, (seatDays.get(r.eventMemberId) ?? 0) + 1);
  }

  const members = await Promise.all(
    scoped.map(async (row) => ({
      seatDays: seatDays.get(row.id) ?? 0,
      id: row.id,
      name: row.name,
      employeeCode: row.employeeCode,
      phone: row.phone,
      status: row.status,
      isReserve: row.isReserve,
      token: row.token,
      locationName: row.gateName ?? row.workingPointName ?? null,
      qrDataUrl: await QRCode.toDataURL(`${baseUrl}/member/${row.token}`, {
        margin: 1,
        width: 320,
        color: { dark: '#1b1917', light: '#ffffff' },
      }),
    })),
  );

  /*
   * Who the picker must NOT offer: the people actually on the event. Somebody
   * whose participation was cancelled is deliberately not in this set, so they
   * can be put back from the same place anyone else is added — leaving them
   * out here is what made a cancelled member impossible to re-add at all.
   */
  const inEvent = new Set(
    (
      await db
        .select({ teamMemberId: eventMembers.teamMemberId })
        .from(eventMembers)
        .where(
          and(eq(eventMembers.eventId, eventId), ne(eventMembers.status, 'CANCELLED')),
        )
    ).map((r) => r.teamMemberId),
  );

  /*
   * Promoters already working another event on the same day. Two events on
   * one evening are two separate crews: offering someone who is due at the
   * other venue would put one person in two places, so the picker hides them.
   * Taken off that other event (cancelled), they become available again.
   */
  const busyElsewhere = new Set(
    (
      await db
        .select({ teamMemberId: eventMembers.teamMemberId })
        .from(eventMembers)
        .innerJoin(events, eq(eventMembers.eventId, events.id))
        .where(
          and(
            eq(events.date, event.date),
            ne(events.id, eventId),
            ne(eventMembers.status, 'CANCELLED'),
          ),
        )
    ).map((r) => r.teamMemberId),
  );
  let hiddenBusy = 0;

  const available = scope.canManage
    ? (
        await db
          .select({
            id: teamMembers.id,
            name: teamMembers.fullName,
            employeeCode: teamMembers.employeeCode,
            favorite: teamMembers.favorite,
          })
          .from(teamMembers)
          .where(eq(teamMembers.active, true))
      )
          .filter((p) => !inEvent.has(p.id))
          .filter((p) => {
            if (!busyElsewhere.has(p.id)) return true;
            hiddenBusy += 1;
            return false;
          })
          /*
           * The shortlist is the admin's own note. A team leader adding
           * people sees the plain roster, with no hint of who is starred.
           */
          .map(({ favorite, ...p }) =>
            scope.user.role === 'ADMIN' ? { ...p, favorite } : p,
          )
          // Alphabetical across both scripts — see src/lib/sort.ts.
          .sort(byName)
    : [];

  return (
    <>
      {/*
        Who has answered, before the roster itself. On the day the links go
        out this is the only part of the page anybody is looking at.
      */}
      {scope.canManage ? (
        <div className="mb-4">
          <InvitationBoard t={t} locale={locale} board={invitations} />
        </div>
      ) : null}

      <PageHeader title={t.eventTeam.title} subtitle={t.eventTeam.subtitle} />
      <EventTeamManager
        t={t}
        eventId={eventId}
        members={members}
        available={available}
        hiddenBusy={hiddenBusy}
        baseUrl={baseUrl}
        canManage={scope.canManage}
      />
    </>
  );
}
