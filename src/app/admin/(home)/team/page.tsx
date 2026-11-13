import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/db';
import { attendance, eventMembers, events, memberSessions, teamMembers } from '@/db/schema';
import { requireRole } from '@/server/auth/rbac';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/ui/panel';
import { resolveBaseUrl, toWhatsAppNumber } from '@/server/services/notify';

import { TeamManager } from './TeamManager';

export default async function TeamPage() {
  await requireRole('ADMIN');
  const { t } = await getT();

  /*
   * The address people actually open, for the invitation the roster writes.
   * Read from the request when nothing is configured, so a link in somebody's
   * WhatsApp never says localhost.
   */
  const appUrl = await resolveBaseUrl();

  const rows = await db
    .select({
      id: teamMembers.id,
      fullName: teamMembers.fullName,
      phone: teamMembers.phone,
      employeeCode: teamMembers.employeeCode,
      cardNumber: teamMembers.cardNumber,
      photoUrl: teamMembers.photoUrl,
      pendingPhotoUrl: teamMembers.pendingPhotoUrl,
      active: teamMembers.active,
      salaried: teamMembers.salaried,
      favorite: teamMembers.favorite,
      defaultPay: teamMembers.defaultPay,
      notes: teamMembers.notes,
      eventCount: sql<number>`(select count(*) from ${eventMembers} where ${eventMembers.teamMemberId} = ${teamMembers.id})`,
      /* Whether a code exists — never the code, which nothing can read back. */
      hasCode: sql<number>`(case when ${teamMembers.accessCodeHash} is not null and ${teamMembers.accessCodeRevokedAt} is null then 1 else 0 end)`,
      sessions: sql<number>`(select count(*) from ${memberSessions} where ${memberSessions.teamMemberId} = ${teamMembers.id} and ${memberSessions.revokedAt} is null)`,
    })
    .from(teamMembers)
    .orderBy(teamMembers.fullName);

  const [completedEventRows, attendanceRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(events)
      .where(inArray(events.status, ['COMPLETED', 'ARCHIVED'])),
    db
      .select({
        id: teamMembers.id,
        fullName: teamMembers.fullName,
        attendedEvents: sql<number>`count(distinct ${events.id})`,
      })
      .from(attendance)
      .innerJoin(eventMembers, eq(attendance.eventMemberId, eventMembers.id))
      .innerJoin(events, eq(attendance.eventId, events.id))
      .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
      .where(
        and(
          inArray(events.status, ['COMPLETED', 'ARCHIVED']),
          inArray(attendance.status, ['PRESENT', 'LATE']),
        ),
      )
      .groupBy(teamMembers.id, teamMembers.fullName)
      .orderBy(sql`count(distinct ${events.id}) desc`, teamMembers.fullName),
  ]);
  const completedEventCount = Number(completedEventRows[0]?.count ?? 0);
  const attendanceLeaders = attendanceRows.filter(
    (member) => completedEventCount > 0 && member.attendedEvents >= Math.ceil(completedEventCount / 2),
  );

  /* Dialling happens on the server, where the country code lives. */
  const members = rows.map((row) => ({
    ...row,
    whatsapp: toWhatsAppNumber(row.phone),
  }));

  return (
    <>
      <PageHeader title={t.team.title} subtitle={t.team.subtitle} />
      <TeamManager
        t={t}
        members={members}
        appUrl={appUrl}
        attendanceLeaders={attendanceLeaders}
        completedEventCount={completedEventCount}
      />
    </>
  );
}
