import { requireRole } from '@/server/auth/rbac';
import { getT } from '@/lib/i18n/server';
import { AppShell } from '@/components/shell/AppShell';
import { globalNav } from '@/components/shell/nav';

/**
 * The map editor's whole world: file an evening, see what became of it, and
 * his own password. Nothing here reads an event, a person or a payment.
 */
export default async function MapsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('MAP_EDITOR');
  const { t } = await getT();
  return (
    <AppShell
      user={user}
      homeHref="/maps"
      sections={globalNav(t, user.role)}
      contextTitle={t.mapDesk.area}
    >
      {children}
    </AppShell>
  );
}
