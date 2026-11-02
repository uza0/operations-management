import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { eventMembers, memberSessions, teamMembers } from '@/db/schema';
import { requireRole } from '@/server/auth/rbac';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/ui/panel';

import { TeamManager } from './TeamManager';

export default async function TeamPage() {
  await requireRole('ADMIN');
  const { t } = await getT();

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

  return (
    <>
      <PageHeader title={t.team.title} subtitle={t.team.subtitle} />
      <TeamManager t={t} members={rows} />
    </>
  );
}
