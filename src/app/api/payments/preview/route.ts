import { requireRole } from '@/server/auth/rbac';
import {
  activeTemplate,
  buildWorkbook,
  collect,
  companyRegister,
} from '@/server/services/payment-file';

/**
 * The same workbook, for looking at — and nothing else.
 *
 * Building the real file and handing the week over are one act, on purpose: a
 * file that leaves without the mark pays everybody twice next week, and a
 * mark without a file pays nobody at all. But that left no way to see what
 * the file would say before committing to it, and a week's wages is not
 * something anybody should send unseen.
 *
 * So this builds the identical workbook from the identical rows and writes
 * nothing: no handover is recorded, no line is stamped, no balance moves, no
 * phone rings. Run it ten times and the system is exactly as it was.
 *
 * It also ignores what would block the real one. Being refused is useful at
 * the moment of sending and useless when the whole point is to go and look at
 * the problems — a file with the holes still in it is what shows you where
 * they are.
 *
 * The one thing it cannot prevent is somebody sending this copy to the
 * company. Hence the name it downloads under, which says what it is in both
 * languages before anybody opens it.
 */
export const dynamic = 'force-dynamic';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const user = await requireRole('ADMIN').catch(() => null);
  if (!user) return new Response('Forbidden', { status: 403 });

  const url = new URL(request.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  if (!DATE.test(from) || !DATE.test(to) || to < from) {
    return new Response('Bad range', { status: 400 });
  }

  const row = await activeTemplate();
  if (!row) return new Response('No template', { status: 409 });

  const bundle = await collect({ from, to });
  if (bundle.fees.length === 0 && bundle.costs.length === 0) {
    return new Response('Nothing in range', { status: 409 });
  }

  const template = Buffer.from(row.bytes as Buffer);
  const bytes = buildWorkbook(template, bundle, companyRegister(template));

  const name = `DRAFT-مسودة-${from}_${to}.xlsx`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  });
}
