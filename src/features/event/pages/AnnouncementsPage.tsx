import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  announcements,
  eventMembers,
  gates,
  teamMembers,
  workingPoints,
} from '@/db/schema';
import { loadEventPage } from '@/features/event/workspace';
import { PageHeader } from '@/components/ui/panel';

import { AnnouncementManager } from './parts/AnnouncementManager';

export async function EventAnnouncementsPage({ eventId }: { eventId: string }) {
  const { scope, locale, t } = await loadEventPage(eventId);

  const [rows, gateRows, wpRows, memberRows] = await Promise.all([
    db
      .select({
        id: announcements.id,
        title: announcements.title,
        message: announcements.message,
        priority: announcements.priority,
        audience: announcements.audience,
        gateId: announcements.gateId,
        gateName: gates.name,
        workingPointName: workingPoints.name,
        memberName: teamMembers.fullName,
        createdByName: announcements.createdByName,
        createdAt: announcements.createdAt,
        expiresAt: announcements.expiresAt,
      })
      .from(announcements)
      .leftJoin(gates, eq(announcements.gateId, gates.id))
      .leftJoin(workingPoints, eq(announcements.workingPointId, workingPoints.id))
      .leftJoin(eventMembers, eq(announcements.eventMemberId, eventMembers.id))
      .leftJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
      .where(eq(announcements.eventId, eventId))
      .orderBy(desc(announcements.createdAt)),
    db
      .select({ id: gates.id, name: gates.name })
      .from(gates)
      .where(eq(gates.eventId, eventId)),
    db
      .select({ id: workingPoints.id, name: workingPoints.name })
      .from(workingPoints)
      .where(eq(workingPoints.eventId, eventId)),
    db
      .select({ id: eventMembers.id, name: teamMembers.fullName })
      .from(eventMembers)
      .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
      .where(eq(eventMembers.eventId, eventId)),
  ]);

  // Gate leaders see event-wide announcements plus their own gate's.
  const visible = scope.gateId
    ? rows.filter((r) => r.audience === 'EVENT' || r.gateId === scope.gateId)
    : rows;

  return (
    <>
      <PageHeader title={t.announcement.title} subtitle={t.announcement.subtitle} />
      <AnnouncementManager
        t={t}
        locale={locale}
        eventId={eventId}
        announcements={visible.map((r) => ({
          id: r.id,
          title: r.title,
          message: r.message,
          priority: r.priority,
          audience: r.audience,
          targetName: r.gateName ?? r.workingPointName ?? r.memberName ?? null,
          createdByName: r.createdByName,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
        }))}
        gates={gateRows}
        workingPoints={wpRows}
        members={memberRows}
        canManage={scope.canManage}
      />
    </>
  );
}
