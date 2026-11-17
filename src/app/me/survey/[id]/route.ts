import { NextResponse } from 'next/server';
import { and, eq, gt, isNull, or } from 'drizzle-orm';

import { db } from '@/db';
import { surveyOpens, surveys } from '@/db/schema';
import { currentMember } from '@/server/services/member-auth';

/**
 * The way out to a questionnaire, through here so the office can see who
 * opened it. Only the fact of opening is kept — what he answers stays with
 * the form.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await currentMember();
  if (!member) return NextResponse.redirect(new URL('/login?as=member', request.url));

  const survey = await db
    .select({ url: surveys.url })
    .from(surveys)
    .where(and(eq(surveys.id, id), or(isNull(surveys.expiresAt), gt(surveys.expiresAt, new Date()))))
    .get();
  if (!survey) return NextResponse.redirect(new URL('/me', request.url));

  await db
    .insert(surveyOpens)
    .values({ surveyId: id, teamMemberId: member.teamMemberId, openedAt: new Date() })
    .onConflictDoNothing();

  return NextResponse.redirect(survey.url);
}
