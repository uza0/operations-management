import Link from 'next/link';

import { loadEventPage } from '@/features/event/workspace';
import { buildBoard } from '@/server/services/board';
import { PageHeader } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/states';
import { IconGate } from '@/components/ui/icons';
import { notFound } from 'next/navigation';

import { DistributionBoard } from './parts/DistributionBoard';
import { SheetLink } from './parts/SheetLink';

export async function EventBoardPage({
  eventId,
  base,
}: {
  eventId: string;
  base: '/admin' | '/leader';
}) {
  const { scope, t } = await loadEventPage(eventId);
  const data = await buildBoard(eventId);
  if (!data) notFound();

  return (
    <>
      <PageHeader
        title={t.board.title}
        subtitle={t.board.subtitle}
        action={
          <Link href={`${base}/events/${eventId}/board/sheet`} className="btn-ghost btn-sm">
            {t.board.openSheet}
          </Link>
        }
      />

      {data.locations.length === 0 ? (
        <EmptyState
          title={t.gate.emptyGates}
          hint={t.gate.emptyGatesHint}
          icon={<IconGate width={20} height={20} />}
          action={
            <Link href={`${base}/events/${eventId}/gates`} className="btn-primary btn-sm">
              {t.nav.gates}
            </Link>
          }
        />
      ) : (
        <>
          <DistributionBoard t={t} data={data} canManage={scope.canManage} />
          {scope.canManage ? (
            <SheetLink t={t} eventId={eventId} token={data.event.boardToken} />
          ) : null}
        </>
      )}
    </>
  );
}
