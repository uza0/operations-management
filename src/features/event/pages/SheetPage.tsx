import { notFound } from 'next/navigation';

import { loadEventPage } from '@/features/event/workspace';
import { buildBoard } from '@/server/services/board';
import { PageHeader } from '@/components/ui/panel';

import { PrintButton } from './parts/ReportParts';
import { SheetDocument } from './parts/SheetDocument';

/** The distribution sheet as the team sees it, with a print button on top. */
export async function EventSheetPage({ eventId }: { eventId: string }) {
  const { locale, t } = await loadEventPage(eventId);
  const data = await buildBoard(eventId);
  if (!data) notFound();

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={t.board.sheetTitle}
          subtitle={t.board.sheetSubtitle}
          action={<PrintButton label={t.report.printReport} />}
        />
      </div>
      <SheetDocument t={t} locale={locale} data={data} />
    </>
  );
}
