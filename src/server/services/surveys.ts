import 'server-only';

import { and, desc, eq, gt, inArray, isNotNull, isNull, or } from 'drizzle-orm';

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

/**
 * Who has not opened each questionnaire yet, with a number to chase them on.
 *
 * Measured against the promoters who can sign in today — the same rule the
 * questionnaire was sent by. "Opened" means opened from the app; whether he
 * then filled the form in is the form site's business, not ours.
 */
export async function notOpenedBySurvey(surveyIds: string[]) {
  const out = new Map<string, { id: string; name: string; phone: string | null }[]>();
  if (surveyIds.length === 0) return out;
  const [people, opens] = await Promise.all([
    db
      .select({ id: teamMembers.id, name: teamMembers.fullName, phone: teamMembers.phone })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.active, true),
          isNotNull(teamMembers.accessCodeHash),
          isNull(teamMembers.accessCodeRevokedAt),
        ),
      ),
    db
      .select({ surveyId: surveyOpens.surveyId, teamMemberId: surveyOpens.teamMemberId })
      .from(surveyOpens)
      .where(inArray(surveyOpens.surveyId, surveyIds)),
  ]);
  const opened = new Set(opens.map((o) => `${o.surveyId}:${o.teamMemberId}`));
  for (const id of surveyIds) {
    out.set(
      id,
      people
        .filter((p) => !opened.has(`${id}:${p.id}`))
        .sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    );
  }
  return out;
}
