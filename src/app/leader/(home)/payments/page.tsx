import { Suspense } from 'react';

import { requireRole } from '@/server/auth/rbac';
import { PaymentFilePage } from '@/features/payment/PaymentFilePage';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireRole('ADMIN');
  const { from, to } = await searchParams;
  return (
    <Suspense>
      <PaymentFilePage base="/leader" from={from} to={to} />
    </Suspense>
  );
}
