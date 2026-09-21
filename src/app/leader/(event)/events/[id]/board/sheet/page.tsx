import { EventSheetPage } from '@/features/event/pages/SheetPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventSheetPage eventId={id} />;
}
