import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { payouts } from '@/db/schema';
import { requireRole } from '@/server/auth/rbac';

/**
 * Hands back the exact file that went to the company.
 *
 * Not rebuilt on request: the rates, the roster and the costs all move, and a
 * file regenerated a month later would differ from the one the company acted
 * on. The bytes that were sent are the bytes that come back.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireRole('ADMIN', 'TEAM_LEADER').catch(() => null);
  if (!user) return new Response('Forbidden', { status: 403 });

  const { id } = await context.params;
  const row = await db.query.payouts.findFirst({ where: eq(payouts.id, id) });
  if (!row?.fileBytes) return new Response('Not found', { status: 404 });

  const name = row.fileName ?? `payments-${row.fromDate}_${row.toDate}.xlsx`;
  return new Response(new Uint8Array(row.fileBytes as Buffer), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(name)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
