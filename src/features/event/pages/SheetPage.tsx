import { notFound } from 'next/navigation';

import { loadEventPage } from '@/features/event/workspace';
import { buildBoard } from '@/server/services/board';
import { PageHeader } from '@/components/ui/panel';

import { PrintButton } from './parts/ReportParts';
import { SheetDocument } from './parts/SheetDocument';

/**
 * The distribution sheet as the team sees it, with a print button on top.
 *
 * Arriving with `?print=1` — which is what the board's "Export PDF" button
 * does — opens the print dialog on its own, so the supervisor goes straight
 * from the board to "Save as PDF".
 */
export async function EventSheetPage({
  eventId,
  autoPrint = false,
}: {
  eventId: string;
  autoPrint?: boolean;
}) {
  const { locale, t } = await loadEventPage(eventId);
  const data = await buildBoard(eventId);
  if (!data) notFound();

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={t.board.sheetTitle}
          subtitle={t.board.sheetSubtitle}
          action={<PrintButton label={t.report.printReport} auto={autoPrint} />}
        />
      </div>
      <SheetDocument t={t} locale={locale} data={data} />
    </>
  );
}
