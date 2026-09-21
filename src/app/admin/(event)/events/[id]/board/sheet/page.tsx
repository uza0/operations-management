import { EventSheetPage } from '@/features/event/pages/SheetPage';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <EventSheetPage eventId={id} autoPrint={query.print === '1'} />;
}
