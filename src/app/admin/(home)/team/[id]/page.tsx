import { requireRole } from '@/server/auth/rbac';
import { MemberLedgerPage } from '@/features/credit/MemberLedgerPage';

export default async function TeamMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('ADMIN');
  const { id } = await params;
  return <MemberLedgerPage memberId={id} />;
}
