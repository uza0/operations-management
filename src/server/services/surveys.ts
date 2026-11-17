import 'server-only';

import { and, desc, eq, gt, isNotNull, isNull, or } from 'drizzle-orm';

import { db } from '@/db';
import { surveyOpens, surveys, teamMembers } from '@/db/schema';

/** Every promoter who can sign in: active, with a code that has not been revoked. */
export async function promotersWithCode(): Promise<string[]> {
  const rows = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.active, true),
        isNotNull(teamMembers.accessCodeHash),
        isNull(teamMembers.accessCodeRevokedAt),
      ),
    );
  return rows.map((row) => row.id);
}

/** What a promoter should see on his home screen: live questionnaires, newest first. */
export async function surveysFor(teamMemberId: string) {
  const now = new Date();
  const rows = await db
    .select({
      id: surveys.id,
      title: surveys.title,
      note: surveys.note,
      createdAt: surveys.createdAt,
      openedAt: surveyOpens.openedAt,
    })
    .from(surveys)
    .leftJoin(
      surveyOpens,
      and(eq(surveyOpens.surveyId, surveys.id), eq(surveyOpens.teamMemberId, teamMemberId)),
    )
    .where(or(isNull(surveys.expiresAt), gt(surveys.expiresAt, now)))
    .orderBy(desc(surveys.createdAt))
    .limit(10);
  return rows;
}
