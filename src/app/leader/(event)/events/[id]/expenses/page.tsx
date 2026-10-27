import { EventExpensesPage } from '@/features/event/pages/ExpensesPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventExpensesPage eventId={id} />;
}
