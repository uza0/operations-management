import 'server-only';

import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventExpenses } from '@/db/schema';

export type ExpenseLine = {
  id: string;
  category: string;
  description: string;
  amount: number;
  createdByName: string;
  createdAt: Date;
};

export type EventExpenses = {
  lines: ExpenseLine[];
  total: number;
  /** What each kind came to, for the closing report. */
  byCategory: { category: string; amount: number }[];
};

/** Everything this event cost, newest first. */
export async function buildExpenses(eventId: string): Promise<EventExpenses> {
  const rows = await db
    .select({
      id: eventExpenses.id,
      category: eventExpenses.category,
      description: eventExpenses.description,
      amount: eventExpenses.amount,
      createdByName: eventExpenses.createdByName,
      createdAt: eventExpenses.createdAt,
    })
    .from(eventExpenses)
    .where(eq(eventExpenses.eventId, eventId))
    .orderBy(desc(eventExpenses.createdAt));

  const totals = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    total += row.amount;
    totals.set(row.category, (totals.get(row.category) ?? 0) + row.amount);
  }

  return {
    lines: rows,
    total,
    byCategory: [...totals.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}
