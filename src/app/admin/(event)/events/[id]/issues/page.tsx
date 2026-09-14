import { EventIssuesPage } from '@/features/event/pages/IssuesPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventIssuesPage  eventId={id} />;
}
