import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { users } from '@/db/schema';
import { requireRole } from '@/server/auth/rbac';
import { getT } from '@/lib/i18n/server';
import { PageHeader, Panel, KeyValue } from '@/components/ui/panel';
import { Notice } from '@/components/ui/states';

import { TemplateForm } from '@/features/payment/TemplateForm';
import { activeTemplate } from '@/server/services/payment-file';

import { PasswordForm } from './PasswordForm';
import { AccountManager } from './AccountManager';

/** Account access and operational settings. */
export default async function SettingsPage() {
  const me = await requireRole('ADMIN');
  const { t, locale } = await getT();
  const templateRow = await activeTemplate();
  const template = templateRow
    ? {
        fileName: templateRow.fileName,
        uploadedByName: templateRow.uploadedByName,
        createdAt: templateRow.createdAt,
      }
    : null;

  const accounts = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      role: users.role,
      active: users.active,
    })
    .from(users)
    .orderBy(users.role, users.name);

  return (
    <>
      <PageHeader title={t.nav.settings} subtitle={t.app.tagline} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title={t.common.signedInAs} className="lg:col-span-1">
          <dl>
            <KeyValue label={t.common.name}>{me.name}</KeyValue>
            <KeyValue label={t.auth.username}>
              <span dir="ltr" className="nums">
                {me.username}
              </span>
            </KeyValue>
            <KeyValue label={t.enums.auditEntity.USER}>
              <Badge tone="brand">{t.enums.role[me.role]}</Badge>
            </KeyValue>
          </dl>
        </Panel>

        <Panel title={t.auth.changePassword} className="lg:col-span-1">
          <PasswordForm t={t} />
        </Panel>

        <Panel title={t.payment.template} className="lg:col-span-1">
          <TemplateForm t={t} locale={locale} current={template} />
        </Panel>

        <Panel title={t.auth.accountManage} className="lg:col-span-3" bodyClassName="p-4">
          <AccountManager t={t} accounts={accounts} currentUserId={me.id} />
        </Panel>
      </div>

      <div className="mt-4">
        <Notice tone="info">{t.eventTeam.tokenSecurityNote}</Notice>
      </div>
    </>
  );
}
