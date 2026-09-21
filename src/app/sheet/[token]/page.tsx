import { notFound } from 'next/navigation';

import { getT } from '@/lib/i18n/server';
import { boardByToken } from '@/server/services/board';

import { PrintButton } from '@/features/event/pages/parts/ReportParts';
import { SheetDocument } from '@/features/event/pages/parts/SheetDocument';

/**
 * The distribution sheet on a public link — no account, no password.
 *
 * It is the printed roster: who is on which gate, doing what. Anyone holding
 * the link can read it and nobody can change anything through it, and the link
 * is revoked the moment the supervisor issues a new one.
 */
export const dynamic = 'force-dynamic';

export default async function PublicSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const data = await boardByToken(token);
  if (!data) notFound();
  const { locale, t } = await getT();

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="no-print mb-4 flex justify-end">
        <PrintButton label={t.report.printReport} auto={query.print === '1'} />
      </div>
      <SheetDocument t={t} locale={locale} data={data} />
    </main>
  );
}
