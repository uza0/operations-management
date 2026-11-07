import { EventReportPage } from '@/features/event/pages/ReportPage';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <EventReportPage eventId={id} base="/leader" requestedView={query.view} />;
}
