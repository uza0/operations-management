import 'server-only';

import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { eventExpenses, eventMembers, teamMembers } from '@/db/schema';

export type ExpenseLine = {
  id: string;
  category: string;
  description: string;
  amount: number;
  createdByName: string;
  createdAt: Date;
  /**
   * The person the money was handed to, when it was handed to one.
   *
   * Most costs are the evening's — water, transport, a run to the shop. Some
   * are a sum put into somebody's hand, and the company's payment file wants
   * those on that person's own row beside his bank account rather than in the
   * general column. Null means the former, which is the common case.
   */
  teamMemberId: string | null;
  paidToName: string | null;
};

export type EventExpenses = {
  lines: ExpenseLine[];
  total: number;
  /** What each kind came to, for the closing report. */
  byCategory: { category: string; amount: number }[];
  /** Who was on this event, for the «paid to» picker. */
  roster: { id: string; name: string }[];
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
      teamMemberId: eventExpenses.teamMemberId,
      paidToName: teamMembers.fullName,
    })
    .from(eventExpenses)
    .leftJoin(teamMembers, eq(eventExpenses.teamMemberId, teamMembers.id))
    .where(eq(eventExpenses.eventId, eventId))
    .orderBy(desc(eventExpenses.createdAt));

  const roster = await db
    .select({ id: teamMembers.id, name: teamMembers.fullName })
    .from(eventMembers)
    .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
    .where(eq(eventMembers.eventId, eventId));

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
    roster: roster.sort((a, b) => a.name.localeCompare(b.name, 'ar')),
  };
}
