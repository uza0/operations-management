import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { settings, teamMembers } from '@/db/schema';

/**
 * The company's standing choices.
 *
 * Read on every payment file, written about once a year. Each one is a key
 * here rather than a column somewhere, because the alternative — a migration
 * every time somebody asks "can it always use…" — is how a settings screen
 * stops being worth having.
 */

/**
 * Whose account the week's event costs are reimbursed to.
 *
 * The leader pays for the scanner credit and the wristbands out of his own
 * pocket on the night, and the company sends it back in one transfer rather
 * than a dozen. So the file carries the costs as a single line in his name,
 * with the itemised list on the costs sheet beside it — which is exactly what
 * the leader used to add by hand after every export.
 */
export const EXPENSE_ACCOUNT = 'payment.expenseAccountMemberId';

export async function readSetting(key: string): Promise<string | null> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
  return row?.value ?? null;
}

export async function writeSetting(key: string, value: string | null, userId: string | null) {
  await db
    .insert(settings)
    .values({ key, value, updatedById: userId })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedById: userId, updatedAt: new Date() },
    });
}

export type ExpenseAccount = {
  id: string;
  name: string;
  card: string | null;
};

/**
 * The person the costs go to, as they stand today.
 *
 * Resolved fresh rather than stored by name: a card number changes on their
 * page and the next file must carry the new one, and a name copied into a
 * settings row at some point last spring is how a transfer goes to an account
 * nobody has used since.
 *
 * Null when nobody has been chosen, or when whoever was chosen has since left
 * the roster — both of which mean the same thing to the file: there is no
 * line to add, and the screen has to say why.
 */
export async function expenseAccount(): Promise<ExpenseAccount | null> {
  const id = await readSetting(EXPENSE_ACCOUNT);
  if (!id) return null;
  const row = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.id, id),
    columns: { id: true, fullName: true, cardNumber: true, active: true },
  });
  if (!row || !row.active) return null;
  return { id: row.id, name: row.fullName, card: row.cardNumber };
}
