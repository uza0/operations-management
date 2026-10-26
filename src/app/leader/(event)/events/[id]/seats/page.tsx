import { EventSeatSetupPage } from '@/features/event/pages/SeatSetupPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventSeatSetupPage eventId={id} />;
}
