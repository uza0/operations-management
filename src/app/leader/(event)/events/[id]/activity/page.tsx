import { EventActivityPage } from '@/features/event/pages/ActivityPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventActivityPage  eventId={id} />;
}
