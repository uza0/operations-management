import { db } from '@/db';
import { eventMembers, teamMembers } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { getT } from '@/lib/i18n/server';
import { requireRole } from '@/server/auth/rbac';
import { buildXlsx, type Cell } from '@/server/services/xlsx';

/**
 * The whole roster as a workbook, in the shape the importer reads back.
 *
 * This is one half of a round trip and is built for the other half: export,
 * fix a hundred phone numbers in Excel where fixing a hundred of anything is
 * quick, upload the same file. So the columns are exactly the columns the
 * importer understands, in the same order, with the same headers — a sheet
 * that comes out of here goes back in without being rearranged.
 *
 * The employee code travels with each row and is what makes the trip safe: a
 * row carrying a code is understood as "this man, changed", and a row with
 * the code cell empty as "somebody new". Delete the codes and you get a
 * second copy of your roster; that is why the column says so in its header.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  await requireRole('ADMIN');
  const { locale, t } = await getT();

  const members = await db
    .select({
      employeeCode: teamMembers.employeeCode,
      fullName: teamMembers.fullName,
      phone: teamMembers.phone,
      cardNumber: teamMembers.cardNumber,
      active: teamMembers.active,
      notes: teamMembers.notes,
      eventCount: sql<number>`(select count(*) from ${eventMembers} where ${eventMembers.teamMemberId} = ${teamMembers.id})`,
    })
    .from(teamMembers)
    .orderBy(teamMembers.fullName);

  const rows: Cell[][] = [
    [
      t.team.employeeCode,
      t.team.fullName,
      t.team.phone,
      t.team.cardNumber,
      t.team.active,
      t.team.notes,
      t.team.eventCount,
    ],
  ];

  for (const member of members) {
    rows.push([
      member.employeeCode,
      member.fullName,
      member.phone ?? '',
      member.cardNumber ?? '',
      member.active ? t.common.yes : t.common.no,
      member.notes ?? '',
      member.eventCount,
    ]);
  }

  const file = buildXlsx(
    { name: t.team.title, rows, widths: [12, 26, 18, 18, 10, 30, 10] },
    locale === 'ar',
  );

  return new Response(new Uint8Array(file), {
    headers: {
      'content-type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="team.xlsx"',
      'cache-control': 'no-store',
    },
  });
}
