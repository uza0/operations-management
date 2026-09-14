import Link from 'next/link';

import { getT } from '@/lib/i18n/server';
import { ErrorState } from '@/components/ui/states';

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-md">
        <ErrorState
          title={t.errors.notFound}
          hint={t.errors.notFoundHint}
          action={
            <Link href="/" className="btn-secondary">
              {t.common.back}
            </Link>
          }
        />
      </div>
    </div>
  );
}
