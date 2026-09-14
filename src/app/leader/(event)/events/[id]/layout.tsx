import { EventWorkspaceLayout } from '@/features/event/workspace';

export default async function LeaderEventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <EventWorkspaceLayout base="/leader" eventId={id}>
      {children}
    </EventWorkspaceLayout>
  );
}
