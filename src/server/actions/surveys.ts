'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { surveys } from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { str } from '@/lib/validation';
import { assertRole } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';
import { pushToMembers } from '@/server/services/push';
import { promotersWithCode } from '@/server/services/surveys';

import { fail, ok, type ActionState } from './types';

function cleanLink(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function refresh() {
  revalidatePath('/admin/surveys');
  revalidatePath('/leader/surveys');
  revalidatePath('/me');
}

/**
 * Posts a questionnaire to the whole team: everybody with a sign-in code is
 * told on his phone, and finds it on his home screen.
 *
 * Admins and team leaders both: the company often sends a leader its own
 * questionnaire to pass on, and this is where he passes it on.
 */
export async function postSurveyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { t } = await getT();
  let user;
  try {
    user = await assertRole('ADMIN', 'TEAM_LEADER');
  } catch {
    return fail(t.errors.forbidden);
  }

  const title = (str(form, 'title') ?? '').trim().slice(0, 160);
  if (!title) return fail(t.surveys.titleRequired);
  const url = cleanLink(str(form, 'url'));
  if (!url) return fail(t.surveys.linkInvalid);
  const note = (str(form, 'note') ?? '').trim().slice(0, 600) || null;
  const days = Number(str(form, 'days') ?? '');
  const expiresAt =
    Number.isFinite(days) && days > 0 && days <= 90
      ? new Date(Date.now() + days * 24 * 3_600_000)
      : null;

  const people = await promotersWithCode();
  const id = newId();
  await db.insert(surveys).values({
    id,
    title,
    url,
    note,
    expiresAt,
    sentTo: people.length,
    createdById: user.id,
    createdByName: user.name,
  });

  await recordAudit({
    actorId: user.id,
    actorName: user.name,
    action: 'CREATE',
    entity: 'SURVEY',
    entityId: id,
    entityLabel: title,
    newValues: { url, sentTo: people.length },
    summary: `${t.surveys.auditPosted}: ${title}`,
  });

  /* After the response: a hundred phones must not hold up the button. */
  after(() =>
    pushToMembers(people, {
      title: t.surveys.pushTitle,
      body: title,
      url: '/me',
      tag: `survey:${id}`,
    }).catch(() => {}),
  );

  refresh();
  return ok(t.surveys.posted.replace('{n}', String(people.length)));
}

/** Takes one down. A leader his own; an admin any. */
export async function deleteSurveyAction(form: FormData): Promise<void> {
  let user;
  try {
    user = await assertRole('ADMIN', 'TEAM_LEADER');
  } catch {
    return;
  }
  const id = str(form, 'surveyId');
  if (!id) return;
  const row = await db.query.surveys.findFirst({ where: eq(surveys.id, id) });
  if (!row) return;
  if (user.role !== 'ADMIN' && row.createdById !== user.id) return;
  await db.delete(surveys).where(eq(surveys.id, id));
  refresh();
}
