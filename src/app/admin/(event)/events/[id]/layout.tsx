import { EventWorkspaceLayout } from '@/features/event/workspace';

export default async function AdminEventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <EventWorkspaceLayout base="/admin" eventId={id}>
      {children}
    </EventWorkspaceLayout>
  );
}
