import { requireRole } from '@/server/auth/rbac';
import { MemberLedgerPage } from '@/features/credit/MemberLedgerPage';

/**
 * One person's account, for the man who hands him the money.
 *
 * The payroll report has always linked each name to the ledger behind it, and
 * for the team leader that link led to a page that did not exist for him — a
 * row he could see a total for and not the events it came from. He is the one
 * being asked "why is mine less this week", so he gets the answer too.
 *
 * The rate form on this page is admin-only and checks that itself; what he
 * gets here is the reading, not the setting.
 */
export default async function TeamMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('ADMIN');
  const { id } = await params;
  return <MemberLedgerPage memberId={id} canSetRate={false} />;
}
