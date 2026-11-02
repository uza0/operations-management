import { Suspense } from 'react';

import { requireRole } from '@/server/auth/rbac';
import { PayrollPage } from '@/features/credit/PayrollPage';

/**
 * The accounts, for the man who actually hands the money over.
 *
 * It was admin-only, which meant every settlement after payday went through
 * one person — and the team leader, who is the one being asked "did my money
 * come through", could not answer without ringing somebody. He sees the same
 * screen and settles the same way; the settlement is recorded against his
 * name and can be reversed, like any other.
 *
 * Gate leaders are not let in: requireRole is the gate, and it names the two
 * roles that may be here.
 */
export default async function LeaderCreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireRole('ADMIN', 'TEAM_LEADER');
  const { from, to } = await searchParams;
  return (
    <Suspense>
      <PayrollPage base="/leader" from={from} to={to} />
    </Suspense>
  );
}
