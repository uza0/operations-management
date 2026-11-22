import { getT } from '@/lib/i18n/server';
import { requireRole } from '@/server/auth/rbac';
import { payrollLedger } from '@/server/services/credit';
import { buildXlsx, type Cell } from '@/server/services/xlsx';
import { formatDate, isValidDate } from '@/lib/time';

/**
 * The payroll sheet as a workbook.
 *
 * One row per person per event, plus a total row per person, so the accounts
 * department can pivot it however they like rather than trusting a single
 * number. Detached approved chair work is payable independently of the event.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  await requireRole('ADMIN');
  const { locale, t } = await getT();

  const url = new URL(request.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const from = fromParam && isValidDate(fromParam) ? fromParam : undefined;
  const to = toParam && isValidDate(toParam) ? toParam : undefined;

  const ledgers = await payrollLedger({ from, to });

  const rows: Cell[][] = [
    [
      t.team.fullName,
      t.team.employeeCode,
      t.team.phone,
      t.event.title,
      t.common.date,
      t.assignment.location,
      t.common.status,
      t.attendance.checkIn,
      t.attendance.checkOut,
      `${t.credit.days} (${t.credit.currency})`,
      t.credit.note,
    ],
  ];

  for (const ledger of ledgers) {
    const counted = ledger.lines.filter((line) => line.closed || line.detachedSeatPay);
    for (const line of counted) {
      const prefix: Cell[] = [
        ledger.name,
        ledger.employeeCode,
        ledger.phone ?? '',
      ];
      if (line.closed && !line.paid) rows.push([
        ...prefix,
        line.eventName,
        formatDate(line.eventDate, locale),
        line.locationName ?? '',
        t.enums.attendanceStatus[line.status],
        line.checkInTime ?? '',
        line.checkOutTime ?? '',
        line.amount,
        line.note ?? '',
      ]);
      if ((line.seatAmount ?? 0) > 0) rows.push([
        ...prefix,
        `${line.eventName} · ${line.detachedSeatPay ? t.payment.seatPayDetachedLabel : t.seatSetup.title}`,
        formatDate(line.eventDate, locale),
        '', '', '', '',
        line.seatAmount,
        line.note ?? '',
      ]);
    }
    // Everyone gets a total line, including the people with nothing — a sheet
    // that omits a name reads as an oversight rather than a zero.
    rows.push([
      ledger.name,
      ledger.employeeCode,
      ledger.phone ?? '',
      t.credit.totalAmount,
      '',
      '',
      '',
      '',
      '',
      ledger.totalAmount,
      '',
    ]);
  }

  const file = buildXlsx(
    {
      name: t.credit.payrollTitle,
      rows,
      widths: [24, 12, 16, 28, 16, 18, 12, 10, 10, 9, 30],
    },
    locale === 'ar',
  );

  const period = from || to ? `-${from ?? ''}_${to ?? ''}` : '';
  return new Response(new Uint8Array(file), {
    headers: {
      'content-type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="team-credit${period}.xlsx"`,
      'cache-control': 'no-store',
    },
  });
}
