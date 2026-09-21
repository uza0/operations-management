import 'server-only';

import { db } from '@/db';
import { teamMembers } from '@/db/schema';
import { nextCodeFrom } from '@/lib/codes';

/** The next free employee code, read off the roster as it stands right now. */
export async function nextEmployeeCode(): Promise<string> {
  const rows = await db.select({ code: teamMembers.employeeCode }).from(teamMembers);
  return nextCodeFrom(rows.map((row) => row.code));
}
