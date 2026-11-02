'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { getT } from '@/lib/i18n/server';
import { signInMember, signOutMember } from '@/server/services/member-auth';

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
