import { Suspense } from 'react';

import { requireRole } from '@/server/auth/rbac';
import { PayrollPage } from '@/features/credit/PayrollPage';

export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireRole('ADMIN');
  const { from, to } = await searchParams;
  return (
    <Suspense>
      <PayrollPage from={from} to={to} />
    </Suspense>
  );
}
