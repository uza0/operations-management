import { EventReportPage } from '@/features/event/pages/ReportPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventReportPage  eventId={id} />;
}
