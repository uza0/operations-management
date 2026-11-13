import type { Metadata } from 'next';
import Link from 'next/link';

import { format } from '@/lib/i18n';
import { getT } from '@/lib/i18n/server';
import { openReset } from '@/server/services/password-reset';
import { ErrorState } from '@/components/ui/states';

import { ResetForm } from './ResetForm';

/*
 * The address is the credential. Kept out of referrers so that following a
 * link off this page does not hand it to wherever the link goes, and out of
 * any index for the obvious reason.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export const dynamic = 'force-dynamic';

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { t } = await getT();
  const reset = await openReset(token);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="panel w-full max-w-md p-5">
        {reset ? (
          <>
            <h1 className="text-[18px] font-bold text-ink-100">{t.auth.resetTitle}</h1>
            <p className="mb-4 mt-1 text-[13px] text-ink-400">
              {format(t.auth.resetFor, { name: reset.name })}
            </p>
            <ResetForm t={t} token={token} />
          </>
        ) : (
          <ErrorState
            title={t.auth.resetLinkDead}
            action={
              <Link href="/login" className="btn-secondary">
                {t.common.back}
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}
