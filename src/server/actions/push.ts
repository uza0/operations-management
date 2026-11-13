'use server';

import { getT } from '@/lib/i18n/server';
import { currentMember } from '@/server/services/member-auth';
import {
  hasSubscription,
  pushConfigured,
  removeSubscription,
  saveSubscription,
  pushToMembers,
} from '@/server/services/push';

import { fail, ok, type ActionState } from './types';

/**
 * A promoter turning notifications on, from his own page.
 *
 * The browser does the asking and the key exchange; what reaches here is the
 * endpoint it was given and the two keys that encrypt messages to it. None of
 * it identifies him — the identity is his session, read here and never taken
 * from the form, so a subscription can only ever be filed against whoever is
 * actually signed in on that phone.
 */
export async function subscribeToPushAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  if (!pushConfigured()) return fail(t.push.unavailable);

  const member = await currentMember();
  if (!member) return fail(t.errors.forbidden);

  const endpoint = String(form.get('endpoint') ?? '');
  const p256dh = String(form.get('p256dh') ?? '');
  const auth = String(form.get('auth') ?? '');
  if (!endpoint.startsWith('https://') || !p256dh || !auth) return fail(t.push.failed);

  const label = String(form.get('deviceLabel') ?? '').slice(0, 80) || null;
  await saveSubscription(member.teamMemberId, { endpoint, p256dh, auth }, label);

  /* One message, so he sees it work rather than taking our word for it. */
  await pushToMembers([member.teamMemberId], {
    title: t.push.testTitle,
    body: t.push.testBody,
    url: '/me',
    tag: 'welcome',
  });

  return ok(t.push.on);
}

/** And turning them off, from the phone he is holding. */
export async function unsubscribeFromPushAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  const member = await currentMember();
  if (!member) return fail(t.errors.forbidden);

  const endpoint = String(form.get('endpoint') ?? '');
  if (endpoint) await removeSubscription(endpoint);
  return ok(t.push.off);
}

/**
 * The phone saying, on every visit, which subscription it holds.
 *
 * The switch on his page reads the browser, and the browser can be sure it is
 * subscribed while the server has no row for it at all: the endpoint was
 * rotated by the push service, a different promoter signed in on that phone
 * and took it over, or a delivery failed for good and the row was dropped.
 * Every one of those looked like "notifications on" to him and like silence
 * to everybody sending him things. So the page hands the server what it holds
 * each time it opens, and the server files it again if it had lost it —
 * quietly, without the welcome buzz.
 */
export async function syncPushAction(keys: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<boolean> {
  if (!pushConfigured()) return false;
  const member = await currentMember();
  if (!member) return false;
  const endpoint = String(keys?.endpoint ?? '');
  const p256dh = String(keys?.p256dh ?? '');
  const auth = String(keys?.auth ?? '');
  if (!endpoint.startsWith('https://') || !p256dh || !auth) return false;
  if (await hasSubscription(member.teamMemberId, endpoint)) return true;
  await saveSubscription(member.teamMemberId, { endpoint, p256dh, auth }, null);
  return true;
}
