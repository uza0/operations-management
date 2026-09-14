import { EventTimelinePage } from '@/features/event/pages/TimelinePage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventTimelinePage  eventId={id} />;
}
