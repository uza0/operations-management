import { asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { timelineItems } from '@/db/schema';
import { loadEventPage } from '@/features/event/workspace';
import { PageHeader } from '@/components/ui/panel';

import { TimelineManager } from './parts/TimelineManager';

export async function EventTimelinePage({ eventId }: { eventId: string }) {
  const { scope, locale, t } = await loadEventPage(eventId);

  const items = await db
    .select()
    .from(timelineItems)
    .where(eq(timelineItems.eventId, eventId))
    .orderBy(asc(timelineItems.scheduledTime));

  return (
    <>
      <PageHeader title={t.timeline.title} subtitle={t.timeline.subtitle} />
      <TimelineManager
        t={t}
        locale={locale}
        eventId={eventId}
        items={items.map((i) => ({
          id: i.id,
          title: i.title,
          description: i.description,
          scheduledTime: i.scheduledTime,
          status: i.status,
        }))}
        canManage={scope.canManage}
      />
    </>
  );
}
