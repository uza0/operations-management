import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/db';
import { attendance, eventMembers, events, memberSessions, teamMembers } from '@/db/schema';
import { requireRole } from '@/server/auth/rbac';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/ui/panel';
import { Notice } from '@/components/ui/states';
import { format } from '@/lib/i18n';
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
      eventCount: sql<number>`(select count(*) from "event_members" em where em."team_member_id" = "team_members"."id")`,
      /*
       * What the column shows: finished events he actually worked — marked
       * present or late on an event that is completed or archived. The plain
       * count above still decides whether the person can be deleted at all.
       */
      attendedCount: sql<number>`(select count(distinct em."event_id") from "event_members" em inner join "events" ev on ev."id" = em."event_id" inner join "attendance" at on at."event_member_id" = em."id" where em."team_member_id" = "team_members"."id" and ev."status" in ('COMPLETED', 'ARCHIVED') and at."status" in ('PRESENT', 'LATE'))`,
      /* Whether a code exists — never the code, which nothing can read back. */
      hasCode: sql<number>`(case when ${teamMembers.accessCodeHash} is not null and ${teamMembers.accessCodeRevokedAt} is null then 1 else 0 end)`,
      sessions: sql<number>`(select count(*) from "member_sessions" ms where ms."team_member_id" = "team_members"."id" and ms."revoked_at" is null)`,
      /*
       * On an event that is still ahead or under way (draft, planning, ready
       * or live) and still on it. Paired with having no code, this is the
       * person who will get a briefing link but cannot sign into the app.
       */
      onOpenEvent: sql<number>`(select count(*) from "event_members" em inner join "events" ev on ev."id" = em."event_id" where em."team_member_id" = "team_members"."id" and em."status" <> 'CANCELLED' and ev."status" in ('DRAFT', 'PLANNING', 'READY', 'LIVE'))`,
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
  const members = rows.map(({ onOpenEvent, ...row }) => ({
    ...row,
    whatsapp: toWhatsAppNumber(row.phone),
    needsCode: Number(row.hasCode) !== 1 && Number(onOpenEvent) > 0,
  }));
  const needingCode = members.filter((m) => m.needsCode).length;

  return (
    <>
      <PageHeader title={t.team.title} subtitle={t.team.subtitle} />
      {needingCode > 0 ? (
        <div className="mb-4">
          <Notice tone="warn">{format(t.team.needsCodeSummary, { n: needingCode })}</Notice>
        </div>
      ) : null}
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
