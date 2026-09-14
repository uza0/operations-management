import { redirect } from 'next/navigation';

import { currentUser, homeFor } from '@/server/auth/rbac';

export default async function RootPage() {
  const user = await currentUser();
  redirect(user ? homeFor(user.role) : '/login');
}
