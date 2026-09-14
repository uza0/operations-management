import Link from 'next/link';

import { getT } from '@/lib/i18n/server';
import { currentUser, homeFor } from '@/server/auth/rbac';
import { ErrorState } from '@/components/ui/states';

export default async function ForbiddenPage() {
  const { t } = await getT();
  const user = await currentUser();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-md">
        <ErrorState
          title={t.auth.unauthorized}
          hint={t.auth.unauthorizedHint}
          action={
            <Link href={user ? homeFor(user.role) : '/login'} className="btn-secondary">
              {t.common.back}
            </Link>
          }
        />
      </div>
    </div>
  );
}
