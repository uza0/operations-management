import { redirect } from 'next/navigation';

import { currentUser, homeFor } from '@/server/auth/rbac';
import { currentMember } from '@/server/services/member-auth';

/**
 * The door, and the reason the app installs on a phone properly at last.
 *
 * The manifest's start_url is "/" for everybody, so the icon on a promoter's
 * home screen is the same icon as everyone else's — no page generated per
 * person, and rotating somebody's code does not break the app he installed.
 * Which of the three doors opens is decided here, by the session.
 */
export default async function RootPage() {
  const user = await currentUser();
  if (user) redirect(homeFor(user.role));

  const member = await currentMember();
  redirect(member ? '/me' : '/login');
}
