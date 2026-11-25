'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { getT } from '@/lib/i18n/server';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { teamMembers } from '@/db/schema';
import { currentMember, signInMember, signOutMember } from '@/server/services/member-auth';

import { fail, type ActionState } from './types';

/** "iPhone · Safari", roughly — something recognisable in a list of devices. */
function describeDevice(agent: string | null): string | null {
  if (!agent) return null;
  const device = /iPhone/i.test(agent)
    ? 'iPhone'
    : /iPad/i.test(agent)
      ? 'iPad'
      : /Android/i.test(agent)
        ? 'Android'
        : /Windows/i.test(agent)
          ? 'Windows'
          : /Mac OS X/i.test(agent)
            ? 'Mac'
            : null;
  const browser = /Edg\//i.test(agent)
    ? 'Edge'
    : /Chrome\//i.test(agent)
      ? 'Chrome'
      : /Safari\//i.test(agent)
        ? 'Safari'
        : /Firefox\//i.test(agent)
          ? 'Firefox'
          : null;
  return [device, browser].filter(Boolean).join(' · ') || null;
}

/**
 * The promoter signs in: phone number, four digits, once.
 *
 * Every failure answers the same sentence. Telling somebody that the number
 * was right but the code was wrong tells them the number is on the team, and
 * the team is not public information.
 */
export async function memberSignInAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const phone = String(form.get('phone') ?? '');
  const code = String(form.get('code') ?? '');

  const agent = (await headers()).get('user-agent');
  const result = await signInMember(phone, code, describeDevice(agent));

  if (!result.ok) {
    return fail(result.reason === 'LOCKED' ? t.memberAuth.locked : t.memberAuth.invalid);
  }

  redirect('/me');
}

export async function memberSignOutAction(): Promise<void> {
  await signOutMember();
  redirect('/login');
}

/** The signed-in member's own choice to stay off group story cards. */
export async function setGroupCardsVisibilityAction(form: FormData): Promise<void> {
  const session = await currentMember();
  if (!session) return;
  const hide = form.get('hide') === '1';
  await db.update(teamMembers).set({ hideFromGroupCards: hide }).where(eq(teamMembers.id, session.teamMemberId));
  revalidatePath('/me/account');
  revalidatePath('/me/card');
}
