import { EventNotifyPage } from '@/features/event/pages/NotifyPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventNotifyPage  eventId={id} />;
}
