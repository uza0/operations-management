import { EventBoardPage } from '@/features/event/pages/BoardPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventBoardPage eventId={id} base="/leader" />;
}
