import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { deletedEvents, users } from '@/db/schema';
import { requireRole } from '@/server/auth/rbac';
import { getT } from '@/lib/i18n/server';
import { PageHeader, Panel, KeyValue } from '@/components/ui/panel';
import { Badge } from '@/components/ui/status';
import { Notice } from '@/components/ui/states';

import { TemplateForm } from '@/features/payment/TemplateForm';
import { ExpenseAccountForm } from '@/features/payment/ExpenseAccountForm';
import { activeTemplate } from '@/server/services/payment-file';
import { payableMembers } from '@/server/actions/payment-file';
import { EXPENSE_ACCOUNT, readSetting } from '@/server/services/settings';

import { PasswordForm } from './PasswordForm';
import { AccountManager } from './AccountManager';
import { DeletedEvents } from './DeletedEvents';

/* Restoring from a backup copy can take a while: Turso builds the copy first. */
export const maxDuration = 60;
import { LogoutPanel } from '@/components/shell/LogoutPanel';

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

  const [members, expenseAccountId] = await Promise.all([
    payableMembers(),
    readSetting(EXPENSE_ACCOUNT),
  ]);

  const accounts = me.systemDeveloper
    ? await db
        .select({
          id: users.id,
          username: users.username,
          name: users.name,
          role: users.role,
          active: users.active,
          systemDeveloper: users.systemDeveloper,
        })
        .from(users)
        .orderBy(users.role, users.name)
    : [];

  const deleted = me.systemDeveloper
    ? await db
        .select({
          id: deletedEvents.id,
          name: deletedEvents.name,
          date: deletedEvents.date,
          deletedAt: deletedEvents.deletedAt,
          deletedByName: deletedEvents.deletedByName,
        })
        .from(deletedEvents)
        .orderBy(desc(deletedEvents.deletedAt))
    : [];

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
              <Badge tone="brand">{me.systemDeveloper ? t.auth.systemDeveloper : t.enums.role[me.role]}</Badge>
            </KeyValue>
          </dl>
        </Panel>

        <Panel title={t.auth.changePassword} className="lg:col-span-1">
          <PasswordForm t={t} />
        </Panel>

        <Panel title={t.payment.template} className="lg:col-span-1">
          <TemplateForm t={t} locale={locale} current={template} />
        </Panel>

        <Panel title={t.payment.expenseAccount} className="lg:col-span-2">
          <ExpenseAccountForm t={t} members={members} currentId={expenseAccountId} />
        </Panel>

        <div className="lg:col-span-3"><LogoutPanel t={t} /></div>

        {me.systemDeveloper ? (
          <Panel title={t.auth.accountManage} className="lg:col-span-3" bodyClassName="p-4">
            <AccountManager t={t} accounts={accounts} currentUserId={me.id} />
          </Panel>
        ) : null}

        {me.systemDeveloper ? (
          <Panel title={t.restore.title} className="lg:col-span-3" bodyClassName="p-4">
            <DeletedEvents t={t} locale={locale} rows={deleted} />
          </Panel>
        ) : null}
      </div>

      <div className="mt-4">
        <Notice tone="info">{t.eventTeam.tokenSecurityNote}</Notice>
      </div>
    </>
  );
}
