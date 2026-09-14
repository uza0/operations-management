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

import { EventTeamManager } from './parts/EventTeamManager';

async function resolveBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, '');
  const store = await headers();
  const host = store.get('x-forwarded-host') ?? store.get('host') ?? 'localhost:3000';
  const proto = store.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

export async function EventTeamPage({ eventId }: { eventId: string }) {
  const { scope, t } = await loadEventPage(eventId);
  const baseUrl = await resolveBaseUrl();

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
        color: { dark: '#0b0f16', light: '#ffffff' },
      }),
    })),
  );

  const inEvent = new Set(
    (
      await db
        .select({ teamMemberId: eventMembers.teamMemberId })
        .from(eventMembers)
        .where(eq(eventMembers.eventId, eventId))
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
          .orderBy(teamMembers.fullName)
      ).filter((p) => !inEvent.has(p.id))
    : [];

  return (
    <>
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
