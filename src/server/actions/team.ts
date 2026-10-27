'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, ne } from 'drizzle-orm';

import { db } from '@/db';
import { eventMembers, memberRates, teamMembers } from '@/db/schema';
import { format } from '@/lib/i18n';
import { getT } from '@/lib/i18n/server';
import { newId } from '@/lib/ids';
import { todayISO } from '@/lib/time';
import { bool, firstIssueKey, str, teamMemberSchema } from '@/lib/validation';
import { assertRole } from '@/server/auth/rbac';
import { readCsv, readXlsx } from '@/server/services/xlsx-read';
import { recordAudit } from '@/server/services/audit';
import { applyStandingRate } from '@/server/services/rates';
import { nextEmployeeCode } from '@/server/services/team';

import { fail, ok, type ActionState } from './types';

export async function saveTeamMemberAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  let user;
  try {
    user = await assertRole('ADMIN');
  } catch {
    return fail(t.errors.forbidden);
  }

  const id = str(form, 'memberId');

  /*
   * A new person is given the next code in the roster's own sequence rather
   * than being asked for one. The form does not send the field at all when
   * adding, so there is nothing to mistype and no way to collide with a code
   * that already belongs to somebody. An existing member keeps whatever code
   * he has unless the edit form sends a different one — a code is the key the
   * rest of the system remembers a person by, so it is never rewritten by
   * accident — and it is not sent by the form at all any more, in either
   * direction. Editing used to offer it as a text box, which meant the one
   * identifier every assignment, report and audit line in the system hangs
   * off could be changed by a supervisor who thought he was fixing a typo.
   */
  const employeeCode = id
    ? ((await db.query.teamMembers.findFirst({ where: eq(teamMembers.id, id) }))
        ?.employeeCode ?? '')
    : await nextEmployeeCode();

  const parsed = teamMemberSchema.safeParse({
    fullName: str(form, 'fullName') ?? '',
    phone: str(form, 'phone'),
    employeeCode,
    cardNumber: str(form, 'cardNumber') ?? '',
    active: bool(form, 'active'),
    salaried: bool(form, 'salaried'),
    defaultPay: String(form.get('defaultPay') ?? ''),
    notes: str(form, 'notes'),
  });
  if (!parsed.success) {
    const errors = t.errors as unknown as Record<string, string>;
    return fail(errors[firstIssueKey(parsed.error)] ?? t.errors.generic);
  }

  // Employee code is the human key operations teams actually use.
  const duplicate = await db.query.teamMembers.findFirst({
    where: id
      ? and(eq(teamMembers.employeeCode, parsed.data.employeeCode), ne(teamMembers.id, id))
      : eq(teamMembers.employeeCode, parsed.data.employeeCode),
  });
  if (duplicate) return fail(t.team.codeTaken);

  if (id) {
    const existing = await db.query.teamMembers.findFirst({
      where: eq(teamMembers.id, id),
    });
    if (!existing) return fail(t.errors.notFound);
    await db
      .update(teamMembers)
      .set({
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
        employeeCode: parsed.data.employeeCode,
        cardNumber: parsed.data.cardNumber ?? null,
        active: parsed.data.active ?? true,
        notes: parsed.data.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(teamMembers.id, id));

    /*
     * The rate is not an ordinary field on this form.
     *
     * Every invitation carries its own copy of the figure, stamped when it
     * was sent, so writing the new rate here and stopping would leave every
     * event he is already on at the old one — a man told he is on forty
     * opening his link and reading thirty. It goes through the same path as
     * the dated correction on his ledger, and reaches every event this
     * system has not yet handed money over for.
     *
     * The same for the monthly contract: ticking it has to take the figure
     * off those events as well as off the person, or he stays owed money
     * the company is already paying him by salary.
     */
    const salaried = parsed.data.salaried ?? false;
    const amount = salaried ? null : (parsed.data.defaultPay ?? null);
    const rateChanged =
      salaried !== existing.salaried || amount !== (existing.defaultPay ?? null);

    let touched = 0;
    if (rateChanged) {
      ({ touched } = await applyStandingRate({
        teamMemberId: id,
        amount,
        salaried,
        from: 'ALL',
      }));

      /*
       * And it goes in the history, like every other rate. "He has been on
       * forty since today" is a sentence somebody will need to read back in
       * three months, and a change nobody recorded is one nobody can check.
       */
      if (!salaried && amount !== null) {
        await db.insert(memberRates).values({
          id: newId(),
          teamMemberId: id,
          amount,
          effectiveFrom: todayISO(),
          note: null,
          createdById: user.id,
          createdByName: user.name,
        });
      }
    }

    await recordAudit({
      actorId: user.id,
      actorName: user.name,
      action: 'UPDATE',
      entity: 'TEAM_MEMBER',
      entityId: id,
      entityLabel: parsed.data.fullName,
      oldValues: {
        fullName: existing.fullName,
        active: existing.active,
        defaultPay: existing.defaultPay,
        salaried: existing.salaried,
      },
      newValues: {
        fullName: parsed.data.fullName,
        active: parsed.data.active ?? true,
        defaultPay: amount,
        salaried,
        events: touched,
      },
      summary: `${t.enums.auditAction.UPDATE}: ${parsed.data.fullName}`,
    });
  } else {
    const memberId = newId();
    await db.insert(teamMembers).values({
      id: memberId,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      employeeCode: parsed.data.employeeCode,
      cardNumber: parsed.data.cardNumber ?? null,
      active: parsed.data.active ?? true,
      /* A new person's rate is kept, not thrown away with the form. */
      salaried: parsed.data.salaried ?? false,
      defaultPay: parsed.data.salaried ? null : (parsed.data.defaultPay ?? null),
      notes: parsed.data.notes ?? null,
    });
    await recordAudit({
      actorId: user.id,
      actorName: user.name,
      action: 'CREATE',
      entity: 'TEAM_MEMBER',
      entityId: memberId,
      entityLabel: parsed.data.fullName,
      newValues: { fullName: parsed.data.fullName },
      summary: `${t.enums.auditAction.CREATE}: ${parsed.data.fullName}`,
    });
  }

  revalidatePath('/admin/team');
  revalidatePath('/admin/credits');
  return ok();
}

export async function toggleTeamMemberAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  let user;
  try {
    user = await assertRole('ADMIN');
  } catch {
    return fail(t.errors.forbidden);
  }

  const id = str(form, 'memberId');
  if (!id) return fail(t.errors.notFound);
  const member = await db.query.teamMembers.findFirst({ where: eq(teamMembers.id, id) });
  if (!member) return fail(t.errors.notFound);

  await db
    .update(teamMembers)
    .set({ active: !member.active, updatedAt: new Date() })
    .where(eq(teamMembers.id, id));

  await recordAudit({
    actorId: user.id,
    actorName: user.name,
    action: 'UPDATE',
    entity: 'TEAM_MEMBER',
    entityId: id,
    entityLabel: member.fullName,
    oldValues: { active: member.active },
    newValues: { active: !member.active },
    summary: `${member.fullName}: ${!member.active ? t.team.active : t.team.inactive}`,
  });

  revalidatePath('/admin/team');
  return ok();
}

export async function deleteTeamMemberAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { t } = await getT();
  let user;
  try {
    user = await assertRole('ADMIN');
  } catch {
    return fail(t.errors.forbidden);
  }

  const id = str(form, 'memberId');
  if (!id) return fail(t.errors.notFound);
  const member = await db.query.teamMembers.findFirst({ where: eq(teamMembers.id, id) });
  if (!member) return fail(t.errors.notFound);

  // People who have worked an event are never deleted — that would erase the
  // operational history of those events. Deactivate instead (spec §48).
  const participations = await db.$count(
    eventMembers,
    eq(eventMembers.teamMemberId, id),
  );
  if (participations > 0) {
    return fail(t.team.deactivate);
  }

  await db.delete(teamMembers).where(eq(teamMembers.id, id));
  await recordAudit({
    actorId: user.id,
    actorName: user.name,
    action: 'DELETE',
    entity: 'TEAM_MEMBER',
    entityId: id,
    entityLabel: member.fullName,
    summary: `${t.enums.auditAction.DELETE}: ${member.fullName}`,
  });

  revalidatePath('/admin/team');
  return ok();
}

/* -------------------------------------------------------------------------- */

/**
 * The roster, taken in from a spreadsheet.
 *
 * Adding sixty promoters one dialog at a time is an evening's work, and the
 * list usually already exists in somebody's Excel file. So the sheet is the
 * input: export, edit, upload.
 *
 * Which row is which person is decided by the employee code alone, and the
 * code is this system's to give. A row carrying a code the roster knows is
 * that man, updated; a row whose code cell is empty is somebody new, and he
 * is issued the next code in the sequence the moment he is written. A row
 * carrying a code the system has never heard of is not a licence to invent
 * one — somebody typed over a cell, and the row is reported back rather than
 * guessed at, because the alternative is a second record for a man who is
 * already in the roster.
 *
 * Nothing is deleted. A person who has disappeared from the sheet stays in
 * the roster: a file is a snapshot of what somebody had to hand, and a
 * missing row is far more often a filter left on than a decision to remove
 * the man from the company.
 */

/** What the importer made of one upload. */
export type ImportReport = {
  added: number;
  updated: number;
  skipped: number;
  /** Row number as the spreadsheet shows it, and why it was not taken. */
  problems: { row: number; name: string; reason: string }[];
};

export type ImportState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success'; report: ImportReport };

/** Finds a column by any of the headers it might carry, in either language. */
function columnOf(headers: string[], names: string[]): number {
  const wanted = names.map((n) => n.trim().toLowerCase()).filter(Boolean);
  return headers.findIndex((header) => wanted.includes(header.trim().toLowerCase()));
}

export async function importTeamAction(
  _prev: ImportState,
  form: FormData,
): Promise<ImportState> {
  const { t } = await getT();
  const user = await assertRole('ADMIN').catch(() => null);
  if (!user) return { status: 'error', message: t.errors.forbidden };

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: t.team.importNoFile };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let rows: string[][];
  try {
    // A zip starts "PK"; anything else that got this far is read as text.
    rows =
      buffer[0] === 0x50 && buffer[1] === 0x4b
        ? readXlsx(buffer)
        : readCsv(buffer.toString('utf8'));
  } catch {
    return { status: 'error', message: t.team.importBadFile };
  }

  const table = rows.filter((row) => row.some((cell) => cell !== ''));
  if (table.length < 2) return { status: 'error', message: t.team.importNoRows };

  /*
   * Headers are matched in both languages, so a file exported in Arabic can
   * be uploaded on an English screen and the other way round — the person
   * who edits the sheet and the person who uploads it are often not the same
   * person, and need not have the same browser.
   */
  const headers = table[0];
  const nameAt = columnOf(headers, ['الاسم الكامل', 'full name', 'name', 'الاسم']);
  if (nameAt < 0) return { status: 'error', message: t.team.importNoName };
  const codeAt = columnOf(headers, ['الرقم الوظيفي', 'employee code', 'code']);
  const phoneAt = columnOf(headers, ['رقم الهاتف', 'الهاتف', 'phone', 'phone number']);
  const cardAt = columnOf(headers, [
    'رقم بطاقة سوبر كي',
    'super key card number',
    'card number',
    'بطاقة سوبر كي',
  ]);
  const notesAt = columnOf(headers, ['ملاحظات', 'ملاحظة', 'notes', 'note']);

  const existing = await db
    .select({
      id: teamMembers.id,
      employeeCode: teamMembers.employeeCode,
    })
    .from(teamMembers);
  const byCode = new Map(existing.map((row) => [row.employeeCode.toLowerCase(), row.id]));

  const report: ImportReport = { added: 0, updated: 0, skipped: 0, problems: [] };
  /*
   * The next code is worked out once and then counted on here rather than
   * being asked for per row: a hundred new people in one upload would
   * otherwise be a hundred round trips, and each would read a roster the
   * previous row had already changed.
   */
  let nextCode = await nextEmployeeCode();
  const bump = (code: string) => {
    const match = /^(.*?)(\d+)$/.exec(code);
    if (!match) return code;
    return match[1] + String(Number(match[2]) + 1).padStart(match[2].length, '0');
  };

  for (let i = 1; i < table.length; i++) {
    const row = table[i];
    const at = i + 1; // what the spreadsheet calls this row
    const cell = (index: number) => (index >= 0 ? (row[index] ?? '').trim() : '');

    const fullName = cell(nameAt);
    const code = cell(codeAt);
    const phone = cell(phoneAt);
    const cardNumber = cell(cardAt) || null;
    const notes = cell(notesAt) || null;

    if (!fullName) {
      report.skipped++;
      report.problems.push({ row: at, name: code || '—', reason: t.team.importRowNoName });
      continue;
    }
    if (!phone) {
      report.skipped++;
      report.problems.push({ row: at, name: fullName, reason: t.team.importRowNoPhone });
      continue;
    }

    const known = code ? byCode.get(code.toLowerCase()) : undefined;
    if (code && !known) {
      report.skipped++;
      report.problems.push({
        row: at,
        name: fullName,
        reason: t.team.importRowUnknownCode,
      });
      continue;
    }

    if (known) {
      await db
        .update(teamMembers)
        .set({ fullName, phone, cardNumber, notes, updatedAt: new Date() })
        .where(eq(teamMembers.id, known));
      report.updated++;
    } else {
      const memberId = newId();
      await db.insert(teamMembers).values({
        id: memberId,
        fullName,
        phone,
        employeeCode: nextCode,
        cardNumber,
        active: true,
        notes,
      });
      byCode.set(nextCode.toLowerCase(), memberId);
      nextCode = bump(nextCode);
      report.added++;
    }
  }

  await recordAudit({
    actorId: user.id,
    actorName: user.name,
    action: 'CREATE',
    entity: 'TEAM_MEMBER',
    entityLabel: file.name,
    newValues: {
      added: report.added,
      updated: report.updated,
      skipped: report.skipped,
    },
    summary: format(t.team.importResult, {
      added: report.added,
      updated: report.updated,
      skipped: report.skipped,
    }),
  });

  revalidatePath('/admin/team');
  return { status: 'success', report };
}
