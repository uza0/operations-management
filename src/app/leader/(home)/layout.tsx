import { requireRole } from '@/server/auth/rbac';
import { getT } from '@/lib/i18n/server';
import { AppShell } from '@/components/shell/AppShell';
import { globalNav } from '@/components/shell/nav';

export default async function LeaderHomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole('TEAM_LEADER', 'GATE_LEADER');
  const { t } = await getT();

  return (
    <AppShell
      user={user}
      homeHref="/leader"
      sections={globalNav(t, user.role)}
      contextTitle={t.nav.leaderArea}
    >
      {children}
    </AppShell>
  );
}
