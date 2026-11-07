import Link from 'next/link';
import { notFound } from 'next/navigation';

import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { memberRates, teamMembers } from '@/db/schema';
import { getT } from '@/lib/i18n/server';
import { memberLedger } from '@/server/services/credit';
import { PageHeader, StatTile } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/states';
import { Badge, attendanceTone } from '@/components/ui/status';
import { IconCheckCircle } from '@/components/ui/icons';
import { formatDate, formatTime } from '@/lib/time';
import type { AttendanceStatus, Task } from '@/lib/constants';
import { formatAmount, formatMoney } from '@/lib/money';

import { RateForm } from './RateForm';

/**
 * One person's record.
 *
 * This is the page someone opens when a member asks "how many days do I have?"
 * — so it answers that in the first line, and then shows every event behind
 * the number, because a balance nobody can trace is a balance people argue
 * about.
 */
export async function MemberLedgerPage({
  memberId,
  /**
   * Whether the viewer may set this person's rate.
   *
   * The team leader reads this page — he is the one asked why a wage is less
   * than last week — but the rate itself is the supervisor's to move. The
   * action behind the form checks that for itself; the form is hidden here so
   * nobody is offered a button that will only refuse him.
   */
  canSetRate = true,
}: {
  memberId: string;
  canSetRate?: boolean;
}) {
  const { locale, t } = await getT();
  const ledger = await memberLedger(memberId);
  if (!ledger) notFound();

  const [person, rateHistory] = await Promise.all([
    db
      .select({ defaultPay: teamMembers.defaultPay })
      .from(teamMembers)
      .where(eq(teamMembers.id, memberId))
      .get(),
    db
      .select()
      .from(memberRates)
      .where(eq(memberRates.teamMemberId, memberId))
      .orderBy(desc(memberRates.effectiveFrom))
      .limit(12),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title={ledger.name}
        subtitle={`${t.credit.ledgerSubtitle} · ${ledger.employeeCode}`}
      />

      {canSetRate ? (
        <div className="mb-4">
          <RateForm
            t={t}
            locale={locale}
            memberId={memberId}
            current={person?.defaultPay ?? null}
            today={today}
            history={rateHistory}
          />
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label={t.credit.totalAmount}
          value={formatMoney(ledger.totalAmount, locale)}
          hint={t.credit.day}
          tone={ledger.totalAmount > 0 ? 'ok' : 'neutral'}
        />
        <StatTile
          label={t.credit.pendingAmount}
          value={formatMoney(ledger.pendingAmount, locale)}
          hint={t.credit.pendingHint}
          tone={ledger.pendingAmount > 0 ? 'info' : 'neutral'}
        />
        <StatTile label={t.credit.eventsWorked} value={ledger.eventsWorked} />
        <StatTile
          label={t.common.status}
          value={ledger.active ? t.team.active : t.team.inactive}
        />
      </div>

      <div className="panel">
        {ledger.lines.length === 0 ? (
          <EmptyState
            title={t.credit.noLines}
            hint={t.credit.noLinesHint}
            icon={<IconCheckCircle width={20} height={20} />}
          />
        ) : (
          <div className="table-wrap">
            <table className="op-table op-table-stack">
              <thead>
                <tr>
                  <th>{t.event.title}</th>
                  <th>{t.common.date}</th>
                  <th>{t.assignment.location}</th>
                  <th>{t.common.status}</th>
                  <th>{t.attendance.checkIn}</th>
                  <th>{t.credit.days}</th>
                </tr>
              </thead>
              <tbody>
                {ledger.lines.map((line) => (
                  <tr key={line.eventId}>
                    <td data-label="">
                      <Link
                        href={`/admin/events/${line.eventId}/attendance`}
                        className="-my-2.5 inline-flex min-h-[44px] items-center py-2.5 font-medium text-ink-100 hover:text-brand-300"
                      >
                        {line.eventName}
                      </Link>
                      {line.venueName ? (
                        <span className="block text-[12px] text-ink-500">
                          {line.venueName}
                        </span>
                      ) : null}
                    </td>
                    <td data-label={t.common.date} className="nums text-ink-300">
                      {formatDate(line.eventDate, locale)}
                      {!line.closed ? (
                        <span className="block text-[12.5px] text-warn-text">
                          {t.credit.openEvent}
                        </span>
                      ) : null}
                    </td>
                    <td data-label={t.assignment.location} className="text-ink-300">
                      {line.locationName ?? <span className="text-ink-500">—</span>}
                      {line.task ? (
                        <span className="block text-[12px] text-ink-500">
                          {t.enums.task[line.task as Task] ?? line.task}
                        </span>
                      ) : null}
                    </td>
                    <td data-label={t.common.status}>
                      <Badge tone={attendanceTone[line.status as AttendanceStatus]}>
                        {t.enums.attendanceStatus[line.status as AttendanceStatus]}
                      </Badge>
                    </td>
                    <td data-label={t.attendance.checkIn} className="nums text-ink-300">
                      {line.checkInTime ? formatTime(line.checkInTime, locale) : '—'}
                      {line.checkOutTime ? (
                        <span className="block text-[12px] text-ink-500">
                          {formatTime(line.checkOutTime, locale)}
                        </span>
                      ) : null}
                    </td>
                    <td data-label={t.credit.days}>
                      {/*
                        A null is not a zero: this person is on the company's
                        monthly payroll and this ledger owes them nothing. A
                        0 here would read as an unpaid debt.
                      */}
                      {line.amount === null ? (
                        <span className="text-[12.5px] text-ink-500">
                          {t.credit.salaried}
                        </span>
                      ) : (
                        <span
                          className={`nums font-semibold ${
                            line.amount > 0 ? 'text-ink-100' : 'text-ink-500'
                          }`}
                        >
                          {formatAmount(line.amount)}
                        </span>
                      )}
                      {/*
                        The chairs are a second day at a second rate, shown
                        beside the event's own figure rather than added into
                        it — a merged number is one nobody can check.
                      */}
                      {line.seatAmount ? (
                        <span className="nums block text-[12.5px] leading-4 text-ink-500">
                          + {formatAmount(line.seatAmount)} · {t.seatSetup.title}
                        </span>
                      ) : null}
                      {line.note ? (
                        <span className="block max-w-[220px] text-[12.5px] leading-4 text-ink-500">
                          {line.note}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
