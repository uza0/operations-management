import 'server-only';

import { and, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventExpenses,
  eventMembers,
  events,
  seatSetupDetails,
  seatSetupMembers,
  paymentTemplates,
  teamMembers,
} from '@/db/schema';
import { CLOSED_STATUSES, effectiveRate } from './credit';
import { excelDate, fillTemplate, unzipAll, type CellValue } from './xlsx-template';

/**
 * The weekly payment file, filled from what the system already knows.
 *
 * The company hands the team leader a workbook, he fills it, and the money
 * moves on what it says. Everything in it — who worked, what they are owed,
 * what the evening cost — is already recorded here, so filling it by hand is
 * a hundred and twenty chances to mistype a bank account.
 *
 * Two things about their form decide how this works, and both were found by
 * running it rather than by reading it:
 *
 *   The account column is not ours to write. In their Events sheet the leader
 *   picks a NAME and a VLOOKUP fetches the account from their own Promoters
 *   register. So the name we write has to be the name they have on file, and
 *   the way to find it is the card number: the Super Key number on our roster
 *   is the bank account number on theirs. We read their register out of the
 *   template, match on the number, and write back their spelling.
 *
 *   Anyone we cannot find there cannot be paid, because their sheet has no
 *   account for a name it does not know. That is a blocker before the export,
 *   not a warning after it.
 */

export const EVENTS_SHEET = 'Events';
export const EXPENSES_SHEET = 'Expenses';
export const EVENT_LIST_SHEET = 'Event List';
export const PROMOTERS_SHEET = 'Promoters';

export type Range = { from: string; to: string };

/* -------------------------------------------------------------------------- */
/* their register                                                             */
/* -------------------------------------------------------------------------- */

/** Reads one sheet of a template as rows of plain text. */
function sheetText(template: Buffer, sheetName: string): string[][] {
  const entries = unzipAll(template);
  const get = (name: string) =>
    entries.find((e) => e.name === name)?.data.toString('utf8') ?? '';

  const rels = get('xl/_rels/workbook.xml.rels');
  const byRelId = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) {
    byRelId.set(m[1], m[2].replace(/^\/?xl\//, '').replace(/^\.\//, ''));
  }
  let part = '';
  for (const m of get('xl/workbook.xml').matchAll(/<sheet\b[^>]*\/>/g)) {
    const name = /\bname="([^"]*)"/.exec(m[0])?.[1];
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    if (name && rid && decode(name) === sheetName) part = `xl/${byRelId.get(rid) ?? ''}`;
  }
  if (!part || part === 'xl/') return [];

  const shared: string[] = [];
  const sharedXml = get('xl/sharedStrings.xml');
  for (const si of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    shared.push(
      [...si[1].matchAll(/<t[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)]
        .map((t) => decode(t[1] ?? ''))
        .join(''),
    );
  }

  const xml = get(part);
  const rows: string[][] = [];
  for (const row of xml.matchAll(/<row[^>]*?>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+)\d+"/.exec(c[1] ?? '')?.[1] ?? '';
      const type = /\bt="([^"]+)"/.exec(c[1] ?? '')?.[1] ?? 'n';
      const body = c[2] ?? '';
      let value = '';
      if (type === 's') {
        const i = Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? -1);
        value = shared[i] ?? '';
      } else if (type === 'inlineStr') {
        value = decode(/<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] ?? '');
      } else {
        value = decode(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '');
      }
      let n = 0;
      for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64);
      cells[n - 1] = value;
    }
    rows.push(cells);
  }
  return rows;
}

const decode = (t: string) =>
  t
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/**
 * Their register, keyed by account number — which is our card number.
 *
 * Every account keeps a list rather than a name, because some of theirs are
 * shared on purpose. Not everybody has a bank account, so two friends put one
 * card between them and divide the money when it lands. Their register lists
 * both names against the same number, which means either name resolves to the
 * same account and the transfer is right whichever one we write.
 *
 * So a shared account is an arrangement, not a fault. What the list is for is
 * writing the right man's name on the row when we can, and saying plainly
 * when we could not — never for refusing to pay him.
 */
export type Register = Map<string, string[]>;

export function companyRegister(template: Buffer): Register {
  const rows = sheetText(template, PROMOTERS_SHEET);
  const out: Register = new Map();
  for (const row of rows.slice(1)) {
    const name = (row[0] ?? '').trim();
    const account = (row[1] ?? '').trim();
    if (!account || !name) continue;
    const names = out.get(account) ?? [];
    if (!names.includes(name)) names.push(name);
    out.set(account, names);
  }
  return out;
}

/** The accounts two people share, so the page can say who shares what. */
export function sharedAccounts(register: Register) {
  return [...register.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([account, names]) => ({ account, names }));
}

const fold = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z\u0600-\u06ff ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export type NameMatch =
  /** Their register knows this account and we are sure whose name to write. */
  | { name: string; sure: true }
  /**
   * A shared account whose two names neither of them spells the way we do.
   *
   * The money still lands in the right place — both names point at the same
   * account — so this is not a reason to hold the file. It is a reason to say
   * on screen that the row will carry their spelling and not ours, in case
   * what it really means is that a card number was typed in wrong.
   */
  | { name: string; sure: false; candidates: string[] }
  /** The register does not have this account at all. */
  | null;

/** Their spelling of this person, and how sure we are of it. */
export function registerName(
  register: Register,
  ourName: string,
  card: string | null,
): NameMatch {
  if (!card) return null;
  const names = register.get(card.trim());
  if (!names?.length) return null;
  if (names.length === 1) return { name: names[0], sure: true };

  const ours = fold(ourName);
  const exact = names.find((n) => fold(n) === ours);
  if (exact) return { name: exact, sure: true };
  return { name: names[0], sure: false, candidates: names };
}

export async function activeTemplate() {
  return db
    .select()
    .from(paymentTemplates)
    .where(eq(paymentTemplates.active, true))
    .orderBy(desc(paymentTemplates.createdAt))
    .get();
}

/* -------------------------------------------------------------------------- */
/* what goes out                                                              */
/* -------------------------------------------------------------------------- */

export type FeeLine = {
  eventMemberId: string;
  eventId: string;
  eventName: string;
  externalId: string | null;
  /**
   * The day the work was done — which for a chair shift is not the event's.
   *
   * Setting out a hall happens the afternoon before, and sometimes across a
   * month boundary: a match on the first of November is prepared on the
   * thirty-first of October. The company reads this column as the date the
   * man worked, so a chair line carries the chair day.
   */
  date: string;
  memberName: string;
  card: string | null;
  amount: number;
  /** What goes in their notes column; empty for an ordinary night. */
  note: string;
};

/**
 * The sentence the company writes beside a chair shift.
 *
 * Their wording, their spelling, their separator — this system is carrying a
 * note into their form, not inventing a format. The date is the chair day in
 * the shape their sheet uses, and a night with no partner company named
 * simply leaves that segment out rather than printing an empty one.
 */
export function seatNote(
  eventName: string,
  partners: string | null,
  date: string,
): string {
  const [, month, day] = date.split('-');
  const parts = ['Chiar editing', eventName];
  if (partners?.trim()) parts.push(partners.trim());
  parts.push(`${Number(month)}/${Number(day)}`);
  return parts.join(' | ');
}

export type CostLine = {
  id: string;
  eventId: string;
  eventName: string;
  externalId: string | null;
  date: string;
  description: string;
  amount: number;
  /** Set when the cost was handed to a person rather than spent on the night. */
  memberName: string | null;
  card: string | null;
};

export type Bundle = {
  fees: FeeLine[];
  costs: CostLine[];
  eventList: { externalId: string | null; name: string; date: string }[];
  feesTotal: number;
  costsTotal: number;
  people: number;
};

/**
 * Everything owed in a window that has not gone out yet.
 *
 * Only finished events: an evening still running is not owed to anybody, and
 * the handover must not promise money for work that has not happened. Only
 * unstamped lines: anything already in a file is already on its way.
 */
export async function collect(range: Range): Promise<Bundle> {
  const [memberRows, costRows, shiftRows] = await Promise.all([
    db
      .select({
        eventMemberId: eventMembers.id,
        eventId: events.id,
        eventName: events.name,
        externalId: events.externalId,
        partners: events.partners,
        date: events.date,
        status: eventMembers.status,
        payMode: eventMembers.payMode,
        payAmount: eventMembers.payAmount,
        eventDefault: events.payDefault,
        memberId: teamMembers.id,
        memberName: teamMembers.fullName,
        card: teamMembers.cardNumber,
        salaried: teamMembers.salaried,
        memberDefault: teamMembers.defaultPay,
      })
      .from(eventMembers)
      .innerJoin(events, eq(eventMembers.eventId, events.id))
      .innerJoin(teamMembers, eq(eventMembers.teamMemberId, teamMembers.id))
      .where(
        and(
          isNull(eventMembers.payoutId),
          inArray(events.status, CLOSED_STATUSES),
          gte(events.date, range.from),
          lte(events.date, range.to),
        ),
      ),
    db
      .select({
        id: eventExpenses.id,
        eventId: events.id,
        eventName: events.name,
        externalId: events.externalId,
        date: events.date,
        description: eventExpenses.description,
        amount: eventExpenses.amount,
        memberName: teamMembers.fullName,
        card: teamMembers.cardNumber,
      })
      .from(eventExpenses)
      .innerJoin(events, eq(eventExpenses.eventId, events.id))
      .leftJoin(teamMembers, eq(eventExpenses.teamMemberId, teamMembers.id))
      .where(
        and(
          isNull(eventExpenses.payoutId),
          inArray(events.status, CLOSED_STATUSES),
          gte(events.date, range.from),
          lte(events.date, range.to),
        ),
      ),
    /*
     * The chair afternoons themselves, with their own dates and rates.
     *
     * Read here rather than taken from the credit ledger's totals: that one
     * answers "how much", and what the file needs is "which days". Only
     * shifts somebody confirmed — an unapproved afternoon is not work this
     * system can say happened.
     */
    db
      .select({
        eventMemberId: seatSetupMembers.eventMemberId,
        date: seatSetupDetails.date,
        pay: seatSetupDetails.payAmount,
      })
      .from(seatSetupMembers)
      .innerJoin(seatSetupDetails, eq(seatSetupMembers.detailId, seatSetupDetails.id))
      .innerJoin(eventMembers, eq(seatSetupMembers.eventMemberId, eventMembers.id))
      .innerJoin(events, eq(eventMembers.eventId, events.id))
      .where(
        and(
          eq(seatSetupMembers.attended, true),
          isNull(eventMembers.payoutId),
          inArray(events.status, CLOSED_STATUSES),
          gte(events.date, range.from),
          lte(events.date, range.to),
        ),
      ),
  ]);

  const shiftsBy = new Map<string, { date: string; pay: number }[]>();
  for (const shift of shiftRows) {
    const list = shiftsBy.get(shift.eventMemberId) ?? [];
    list.push({ date: shift.date, pay: shift.pay });
    shiftsBy.set(shift.eventMemberId, list);
  }
  for (const list of shiftsBy.values()) list.sort((a, b) => a.date.localeCompare(b.date));

  const fees: FeeLine[] = [];
  for (const row of memberRows) {
    if (row.status === 'CANCELLED') continue;

    /* The night itself. A man on a monthly contract is owed nothing here,
     * and a zero beside his name would read as an unpaid debt. */
    const nightly = effectiveRate({
      paid: false,
      payMode: row.payMode,
      payAmount: row.payAmount,
      personSalaried: row.salaried,
      personDefaultPay: row.memberDefault,
      eventDefault: row.eventDefault,
    });
    const common = {
      note: '',
      eventMemberId: row.eventMemberId,
      eventId: row.eventId,
      eventName: row.eventName,
      externalId: row.externalId,
      date: row.date,
      memberName: row.memberName,
      card: row.card,
    };
    if (nightly !== null && nightly > 0) fees.push({ ...common, amount: nightly });

    /*
     * And the afternoons before it, each as its own line.
     *
     * They were one merged figure on the event's own date, which is wrong
     * twice over: two chair days at two different rates are two days' work,
     * and the day they were worked is not the day of the match. A hall
     * prepared on the thirty-first for a match on the first belongs to
     * October, and the company's sheet is read by that date.
     *
     * The chairs follow the event in and out of a file, though. They are
     * paid when the event is paid and not before — the man's night and his
     * afternoon are one engagement, under one event number, and splitting
     * them across two handovers is how somebody gets half his money and
     * nobody can say why.
     */
    if (!row.salaried) {
      for (const shift of shiftsBy.get(row.eventMemberId) ?? []) {
        if (shift.pay <= 0) continue;
        fees.push({
          ...common,
          date: shift.date,
          amount: shift.pay,
          note: seatNote(row.eventName, row.partners, shift.date),
        });
      }
    }
  }

  const costs: CostLine[] = costRows.map((row): CostLine => ({
    id: row.id,
    eventId: row.eventId,
    eventName: row.eventName,
    externalId: row.externalId,
    date: row.date,
    description: row.description,
    amount: row.amount,
    memberName: row.memberName ?? null,
    card: row.card ?? null,
  }));

  const byEvent = new Map<string, { externalId: string | null; name: string; date: string }>();
  for (const row of [...fees, ...costs]) {
    if (!byEvent.has(row.eventId)) {
      byEvent.set(row.eventId, {
        externalId: row.externalId,
        name: row.eventName,
        date: row.date,
      });
    }
  }

  return {
    fees,
    costs,
    eventList: [...byEvent.values()].sort((a, b) => a.date.localeCompare(b.date)),
    feesTotal: fees.reduce((s, f) => s + f.amount, 0),
    costsTotal: costs.reduce((s, c) => s + c.amount, 0),
    people: new Set(fees.map((f) => f.card ?? f.memberName)).size,
  };
}

/* -------------------------------------------------------------------------- */
/* what would stop it                                                          */
/* -------------------------------------------------------------------------- */

export type Blocker = { kind: 'NO_CARD' | 'NOT_REGISTERED' | 'NO_EVENT_ID'; label: string };

/** Worth saying, not worth stopping for. */
export type Warning = { kind: 'NAME_GUESSED'; label: string };

/**
 * Everything that would make the file unpayable, named before it is written.
 *
 * Their sheet turns a name into an account; a person it does not know gets no
 * account and no transfer, and a silent row is the worst outcome here. So the
 * export refuses rather than produces a file with holes in it.
 */
export function blockers(bundle: Bundle, register: Register): Blocker[] {
  const out: Blocker[] = [];
  const seen = new Set<string>();

  const check = (name: string, card: string | null) => {
    const key = `${name}|${card ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!card) {
      out.push({ kind: 'NO_CARD', label: name });
      return;
    }
    if (!registerName(register, name, card)) {
      out.push({ kind: 'NOT_REGISTERED', label: `${name} — ${card}` });
    }
  };

  for (const fee of bundle.fees) check(fee.memberName, fee.card);
  for (const cost of bundle.costs) if (cost.memberName) check(cost.memberName, cost.card);

  for (const event of bundle.eventList) {
    if (!event.externalId) out.push({ kind: 'NO_EVENT_ID', label: event.name });
  }
  return out;
}

/**
 * Rows that will carry a name we are not certain of.
 *
 * The account is shared and neither of the names on it is spelled the way we
 * spell his, so the row goes out under their spelling. The transfer is right
 * — one account, one destination — but it is the kind of thing worth a look,
 * because the innocent explanation is a shared card and the other one is a
 * card number typed into the wrong person's row.
 */
export function warnings(bundle: Bundle, register: Register): Warning[] {
  const out: Warning[] = [];
  const seen = new Set<string>();
  const check = (name: string, card: string | null) => {
    if (seen.has(name)) return;
    seen.add(name);
    const match = registerName(register, name, card);
    if (match && !match.sure) {
      out.push({ kind: 'NAME_GUESSED', label: `${name} → ${match.candidates.join(' / ')}` });
    }
  };
  for (const fee of bundle.fees) check(fee.memberName, fee.card);
  for (const cost of bundle.costs) if (cost.memberName) check(cost.memberName, cost.card);
  return out;
}

/* -------------------------------------------------------------------------- */
/* the workbook                                                               */
/* -------------------------------------------------------------------------- */

/** Their name for this person, so their own lookup finds the account. */
const theirName = (register: Register, name: string, card: string | null) =>
  registerName(register, name, card)?.name ?? name;

export function buildWorkbook(template: Buffer, bundle: Bundle, register: Register): Buffer {
  const eventRows: CellValue[][] = [];

  for (const fee of bundle.fees) {
    eventRows.push([
      fee.eventName,
      excelDate(fee.date),
      theirName(register, fee.memberName, fee.card),
      null, // their VLOOKUP fills the account from the name
      fee.amount,
      'Event',
      fee.note,
    ]);
  }
  /* A cost handed to a person rides on their own row, as their form asks. */
  for (const cost of bundle.costs) {
    if (!cost.memberName) continue;
    eventRows.push([
      cost.eventName,
      excelDate(cost.date),
      theirName(register, cost.memberName, cost.card),
      null,
      cost.amount,
      'Expense',
      cost.description,
    ]);
  }

  const costRows: CellValue[][] = bundle.costs
    .filter((c) => !c.memberName)
    .map((c) => [
      excelDate(c.date),
      c.description,
      c.eventName,
      c.externalId ? Number(c.externalId) || c.externalId : null,
      c.amount,
      '',
    ]);

  const listRows: CellValue[][] = bundle.eventList.map((e) => [
    e.externalId ? Number(e.externalId) || e.externalId : null,
    e.name,
    excelDate(e.date),
    excelDate(e.date),
    '',
  ]);

  return fillTemplate(template, [
    { sheet: EVENTS_SHEET, rows: eventRows },
    { sheet: EXPENSES_SHEET, rows: costRows },
    { sheet: EVENT_LIST_SHEET, rows: listRows },
  ]);
}

export const fileNameFor = (range: Range) =>
  `TicketZone-Payments-${range.from}_${range.to}.xlsx`;

export { or };

/* -------------------------------------------------------------------------- */
/* the preview, and the handover                                              */
/* -------------------------------------------------------------------------- */

export type Preview = {
  range: Range;
  bundle: Bundle;
  blockers: Blocker[];
  /** Rows going out under a name we had to pick. */
  warnings: Warning[];
  /** The accounts two people share between them. */
  shared: { account: string; names: string[] }[];
  /** Null when nobody has uploaded the company's workbook yet. */
  template: { fileName: string; uploadedByName: string; createdAt: Date } | null;
};

export async function previewExport(range: Range): Promise<Preview> {
  const [bundle, row] = await Promise.all([collect(range), activeTemplate()]);
  if (!row) {
    return { range, bundle, blockers: [], warnings: [], shared: [], template: null };
  }

  const template = Buffer.from(row.bytes as Buffer);
  const register = companyRegister(template);
  return {
    range,
    bundle,
    blockers: blockers(bundle, register),
    warnings: warnings(bundle, register),
    /*
     * Only the ones this file actually pays. Their whole register has a
     * handful of shared cards in it; listing all of them every week would be
     * noise about people who did not work.
     */
    shared: sharedAccounts(register).filter((row) =>
      bundle.fees.some((f) => f.card?.trim() === row.account),
    ),
    template: {
      fileName: row.fileName,
      uploadedByName: row.uploadedByName,
      createdAt: row.createdAt,
    },
  };
}

export type Handover = {
  id: string;
  fileName: string;
  bytes: Buffer;
  feesTotal: number;
  costsTotal: number;
  rowCount: number;
  people: number;
};

/**
 * Builds the file and records that this week's money went out in it.
 *
 * The file and the stamp are one act. A file that leaves without the stamp is
 * money that will be sent again next week; a stamp without a file is money
 * that never went anywhere. So the rows are gathered, the workbook is built
 * from them, and only then — in the same breath — are those exact rows tied
 * to the handover the workbook is.
 *
 * Nothing is deleted, here or ever: "owed" means a line tied to no handover,
 * so reversing one is a matter of untying it. The file itself is kept beside
 * the record, because the question asked three weeks later is never "what did
 * we owe" but "what did we actually send".
 */
export function buildHandover(
  template: Buffer,
  bundle: Bundle,
  range: Range,
): Omit<Handover, 'id'> {
  const register = companyRegister(template);
  return {
    fileName: fileNameFor(range),
    bytes: buildWorkbook(template, bundle, register),
    feesTotal: bundle.feesTotal,
    costsTotal: bundle.costsTotal,
    rowCount: bundle.fees.length + bundle.costs.length,
    people: bundle.people,
  };
}
