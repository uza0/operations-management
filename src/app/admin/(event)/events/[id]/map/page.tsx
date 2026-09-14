import { EventMapPage } from '@/features/event/pages/MapPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventMapPage  eventId={id} />;
}
