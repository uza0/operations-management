import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { teamMembers } from '@/db/schema';
import {
  activeTemplate,
  companyRegister,
  fold,
  registerName,
  type Register,
} from '@/server/services/payment-file';

/**
 * Every account in the system, checked against the company's register —
 * before the week it matters.
 *
 * The payment file already refuses to go out with an unpayable row in it, and
 * names what is wrong. But it only looks at the people who worked that week,
 * and it looks the moment the file is wanted — which is the worst moment to
 * discover that somebody's card number was never registered, because the man
 * is waiting for his money and the office is waiting for the file.
 *
 * This looks at everybody, on any day, and it is the only screen that can
 * find the quiet one: a person whose number is simply absent from their
 * register. Their sheet turns a name into an account; a name it does not know
 * returns #N/A, the row pays nobody, and the company's own total skips him
 * without a word. Nobody notices until he asks where his money is.
 */

export type AccountIssue =
  /** No card at all: there is nothing to pay into. */
  | { kind: 'NO_CARD'; name: string; code: string; id: string }
  /** A card the company's register has never heard of — the silent one. */
  | { kind: 'NOT_REGISTERED'; name: string; code: string; id: string; card: string }
  /** Registered, but under a spelling of his name that is not ours. */
  | {
      kind: 'NAME_DIFFERS';
      name: string;
      code: string;
      id: string;
      card: string;
      theirs: string[];
    }
  /** One card on more than one person in this system. */
  | { kind: 'CARD_SHARED'; card: string; names: string[]; ids: string[] }
  /** The same name twice on the roster — one of them collects nothing. */
  | { kind: 'DUPLICATE_NAME'; name: string; codes: string[]; ids: string[] };

export type AccountCheck = {
  /** Null when nobody has uploaded the company's workbook yet. */
  template: { fileName: string; createdAt: Date } | null;
  checked: number;
  /** Would be paid correctly today. */
  clean: number;
  issues: AccountIssue[];
};

function scan(
  people: { id: string; fullName: string; employeeCode: string; cardNumber: string | null }[],
  register: Register,
): AccountIssue[] {
  const issues: AccountIssue[] = [];

  for (const person of people) {
    const card = person.cardNumber?.trim() ?? '';
    if (!card) {
      issues.push({
        kind: 'NO_CARD',
        name: person.fullName,
        code: person.employeeCode,
        id: person.id,
      });
      continue;
    }

    const match = registerName(register, person.fullName, card);
    if (!match) {
      issues.push({
        kind: 'NOT_REGISTERED',
        name: person.fullName,
        code: person.employeeCode,
        id: person.id,
        card,
      });
      continue;
    }

    /*
     * Registered, but their sheet spells him differently. Not a fault — the
     * file goes out under their spelling and the transfer lands — but it is
     * the shape a mistyped card number also takes, so it is worth an eye.
     */
    const theirs = register.get(card) ?? [];
    if (!theirs.some((name) => fold(name) === fold(person.fullName))) {
      issues.push({
        kind: 'NAME_DIFFERS',
        name: person.fullName,
        code: person.employeeCode,
        id: person.id,
        card,
        theirs,
      });
    }
  }

  /*
   * Two people on one card inside this system. Sometimes true — a man with no
   * card of his own uses a friend's and they split it — and sometimes a number
   * typed into the wrong person's row, which pays one man twice and the other
   * never. The screen says which names, and a person decides which it is.
   */
  const byCard = new Map<string, typeof people>();
  for (const person of people) {
    const card = person.cardNumber?.trim();
    if (!card) continue;
    byCard.set(card, [...(byCard.get(card) ?? []), person]);
  }
  for (const [card, group] of byCard) {
    if (group.length > 1) {
      issues.push({
        kind: 'CARD_SHARED',
        card,
        names: group.map((p) => p.fullName),
        ids: group.map((p) => p.id),
      });
    }
  }

  /*
   * The same name on the roster twice: usually one person entered once by the
   * import and once by hand. His evenings then split between two records, and
   * whichever one carries no card quietly earns nothing.
   */
  const byName = new Map<string, typeof people>();
  for (const person of people) {
    const key = fold(person.fullName);
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), person]);
  }
  for (const group of byName.values()) {
    if (group.length > 1) {
      issues.push({
        kind: 'DUPLICATE_NAME',
        name: group[0].fullName,
        codes: group.map((p) => p.employeeCode),
        ids: group.map((p) => p.id),
      });
    }
  }

  return issues;
}

/** Severity first, so the ones that pay nobody are read first. */
const ORDER: Record<AccountIssue['kind'], number> = {
  NOT_REGISTERED: 0,
  NO_CARD: 1,
  DUPLICATE_NAME: 2,
  CARD_SHARED: 3,
  NAME_DIFFERS: 4,
};

export async function accountCheck(): Promise<AccountCheck> {
  const [people, templateRow] = await Promise.all([
    db
      .select({
        id: teamMembers.id,
        fullName: teamMembers.fullName,
        employeeCode: teamMembers.employeeCode,
        cardNumber: teamMembers.cardNumber,
      })
      .from(teamMembers)
      .where(eq(teamMembers.active, true))
      .all(),
    activeTemplate(),
  ]);

  if (!templateRow) {
    return { template: null, checked: people.length, clean: 0, issues: [] };
  }

  const register = companyRegister(Buffer.from(templateRow.bytes as Buffer));
  const issues = scan(people, register).sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);

  /*
   * Clean means "would be paid correctly today": a card the register knows,
   * under a name it agrees with. A different spelling still pays, so it does
   * not disqualify anybody from the count.
   */
  const broken = new Set(
    issues
      .filter((issue) => issue.kind === 'NO_CARD' || issue.kind === 'NOT_REGISTERED')
      .map((issue) => ('id' in issue ? issue.id : '')),
  );

  return {
    template: { fileName: templateRow.fileName, createdAt: templateRow.createdAt },
    checked: people.length,
    clean: people.length - broken.size,
    issues,
  };
}
