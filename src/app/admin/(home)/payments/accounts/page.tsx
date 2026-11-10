import { Suspense } from 'react';

import { requireRole } from '@/server/auth/rbac';
import { AccountCheckPage } from '@/features/payment/AccountCheckPage';

export default async function AdminAccountCheck() {
  await requireRole('ADMIN');
  return (
    <Suspense>
      <AccountCheckPage />
    </Suspense>
  );
}
