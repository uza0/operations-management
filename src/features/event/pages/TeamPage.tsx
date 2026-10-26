import { headers } from 'next/headers';
import { and, eq, ne } from 'drizzle-orm';
import QRCode from 'qrcode';

import { db } from '@/db';
import {
  assignments,
  eventMembers,
  gates,
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
  const { scope, locale, t } = await loadEventPage(eventId);
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

  const members = await Promise.all(
    scoped.map(async (row) => ({
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

  const available = scope.canManage
    ? (
        await db
          .select({
            id: teamMembers.id,
            name: teamMembers.fullName,
            employeeCode: teamMembers.employeeCode,
          })
          .from(teamMembers)
          .where(eq(teamMembers.active, true))
      )
          .filter((p) => !inEvent.has(p.id))
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
        baseUrl={baseUrl}
        canManage={scope.canManage}
      />
    </>
  );
}
