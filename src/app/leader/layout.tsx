import { requireRole } from '@/server/auth/rbac';

/** Team leaders and gate leaders. Event-level access is checked per event. */
export default async function LeaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole('TEAM_LEADER', 'GATE_LEADER');
  return <>{children}</>;
}
