import { redirect } from 'next/navigation';

import { loadManagedEventPage } from '@/features/event/workspace';
import { buildExpenses } from '@/server/services/expenses';
import { PageHeader, Panel } from '@/components/ui/panel';

import { ExpenseManager } from './parts/ExpenseManager';

/**
 * What the evening cost.
 *
 * Management-only, like every other screen that prints a figure: the team
 * leader who spent the money and the supervisor who answers for it.
 */
export async function EventExpensesPage({ eventId }: { eventId: string }) {
  const { scope, locale, t } = await loadManagedEventPage(eventId);
  if (scope.user.role !== 'ADMIN') redirect('/forbidden');
  const data = await buildExpenses(eventId);

  return (
    <>
      <PageHeader title={t.expense.title} subtitle={t.expense.subtitle} />
      <Panel bodyClassName="p-0">
        <ExpenseManager t={t} locale={locale} eventId={eventId} data={data} />
      </Panel>
    </>
  );
}
