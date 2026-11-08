import { getT } from '@/lib/i18n/server';
import { requireRole } from '@/server/auth/rbac';
import { PageHeader, Panel } from '@/components/ui/panel';
import { PasswordForm } from '@/app/admin/(home)/settings/PasswordForm';
import { LogoutPanel } from '@/components/shell/LogoutPanel';

export default async function LeaderSettingsPage() {
  await requireRole('TEAM_LEADER', 'GATE_LEADER');
  const { t } = await getT();

  return (
    <>
      <PageHeader title={t.nav.settings} subtitle={t.app.tagline} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t.auth.changePassword}><PasswordForm t={t} /></Panel>
        <LogoutPanel t={t} />
      </div>
    </>
  );
}
