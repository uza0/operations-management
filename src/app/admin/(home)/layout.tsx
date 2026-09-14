import { requireRole } from '@/server/auth/rbac';
import { getT } from '@/lib/i18n/server';
import { AppShell } from '@/components/shell/AppShell';
import { globalNav } from '@/components/shell/nav';

export default async function AdminHomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole('ADMIN');
  const { t } = await getT();

  return (
    <AppShell
      user={user}
      homeHref="/admin"
      sections={globalNav(t, 'ADMIN')}
      contextTitle={t.nav.adminArea}
    >
      {children}
    </AppShell>
  );
}
