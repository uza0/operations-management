import { requireRole } from '@/server/auth/rbac';

/**
 * Everything under /admin requires an admin account. The shells live one level
 * deeper: (home) carries the global sidebar, (event) the event workspace.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole('ADMIN');
  return <>{children}</>;
}
