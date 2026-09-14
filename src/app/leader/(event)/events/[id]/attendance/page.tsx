import { EventAttendancePage } from '@/features/event/pages/AttendancePage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventAttendancePage  eventId={id} />;
}
