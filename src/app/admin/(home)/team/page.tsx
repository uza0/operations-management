import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { eventMembers, memberSessions, teamMembers } from '@/db/schema';
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
      active: teamMembers.active,
      salaried: teamMembers.salaried,
      defaultPay: teamMembers.defaultPay,
      notes: teamMembers.notes,
      eventCount: sql<number>`(select count(*) from ${eventMembers} where ${eventMembers.teamMemberId} = ${teamMembers.id})`,
      /* Whether a code exists — never the code, which nothing can read back. */
      hasCode: sql<number>`(case when ${teamMembers.accessCodeHash} is not null and ${teamMembers.accessCodeRevokedAt} is null then 1 else 0 end)`,
      sessions: sql<number>`(select count(*) from ${memberSessions} where ${memberSessions.teamMemberId} = ${teamMembers.id} and ${memberSessions.revokedAt} is null)`,
    })
    .from(teamMembers)
    .orderBy(teamMembers.fullName);

  /* Dialling happens on the server, where the country code lives. */
  const members = rows.map((row) => ({
    ...row,
    whatsapp: toWhatsAppNumber(row.phone),
  }));

  return (
    <>
      <PageHeader title={t.team.title} subtitle={t.team.subtitle} />
      <TeamManager t={t} members={members} appUrl={appUrl} />
    </>
  );
}
