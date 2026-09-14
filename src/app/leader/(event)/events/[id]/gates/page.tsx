import { EventGatesPage } from '@/features/event/pages/GatesPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventGatesPage base="/leader" eventId={id} />;
}
