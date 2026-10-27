import { EditEventPage } from '@/features/event/pages/EditEventPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditEventPage eventId={id} />;
}
