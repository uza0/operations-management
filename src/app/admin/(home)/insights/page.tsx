import { Suspense } from 'react';

import { requireRole } from '@/server/auth/rbac';
import { InsightsPage } from '@/features/insights/InsightsPage';
import { defaultInsightRange, readRange } from '@/features/insights/range';

export default async function AdminInsights({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireRole('ADMIN');
  const { from, to } = await searchParams;
  const range = readRange(from, to) ?? defaultInsightRange();
  return (
    <Suspense>
      <InsightsPage range={range} />
    </Suspense>
  );
}
