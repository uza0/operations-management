import Link from 'next/link';
import { desc } from 'drizzle-orm';

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

/**
 * Settings, one section at a time.
 *
 * Everything used to sit on one long page — the password next to the payment
 * template next to every staff account — and the part someone came for was
 * usually at the bottom. Now each kind of setting has its own section, chosen
 * from the row at the top, and only that section's data is loaded. The
 * developer's own sections (accounts, deleted events) appear for him alone.
 */
type Tab = 'account' | 'payments' | 'users' | 'deleted';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const me = await requireRole('ADMIN');
  const { t, locale } = await getT();
  const params = await searchParams;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'account', label: t.settings.account },
    { key: 'payments', label: t.settings.payments },
    ...(me.systemDeveloper
      ? ([
          { key: 'users', label: t.settings.users },
          { key: 'deleted', label: t.settings.deleted },
        ] as const)
      : []),
  ];
  const active: Tab = tabs.some((tab) => tab.key === params.tab) ? (params.tab as Tab) : 'account';

  return (
    <>
      <PageHeader title={t.nav.settings} subtitle={t.app.tagline} />

      <nav className="mb-4 flex flex-wrap gap-2" aria-label={t.nav.settings}>
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === 'account' ? '/admin/settings' : `/admin/settings?tab=${tab.key}`}
            className={`shrink-0 rounded-full border px-4 py-2 text-[13.5px] font-medium transition-colors ${
              tab.key === active
                ? 'border-brand-500 bg-brand-500/15 text-ink-100'
                : 'border-ink-700 text-ink-400 hover:text-ink-100'
            }`}
            aria-current={tab.key === active ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {active === 'account' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title={t.common.signedInAs}>
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

          <Panel title={t.auth.changePassword}>
            <PasswordForm t={t} />
          </Panel>

          <div className="lg:col-span-2">
            <LogoutPanel t={t} />
          </div>

          <div className="lg:col-span-2">
            <Notice tone="info">{t.eventTeam.tokenSecurityNote}</Notice>
          </div>
        </div>
      ) : null}

      {active === 'payments' ? <PaymentsSection t={t} locale={locale} /> : null}

      {active === 'users' && me.systemDeveloper ? (
        <Panel title={t.auth.accountManage} bodyClassName="p-4">
          <AccountManager t={t} accounts={await staffAccounts()} currentUserId={me.id} />
        </Panel>
      ) : null}

      {active === 'deleted' && me.systemDeveloper ? (
        <Panel title={t.restore.title} bodyClassName="p-4">
          <DeletedEvents t={t} locale={locale} rows={await deletedRows()} />
        </Panel>
      ) : null}
    </>
  );
}

async function PaymentsSection({ t, locale }: { t: Awaited<ReturnType<typeof getT>>['t']; locale: 'ar' | 'en' }) {
  const [templateRow, members, expenseAccountId] = await Promise.all([
    activeTemplate(),
    payableMembers(),
    readSetting(EXPENSE_ACCOUNT),
  ]);
  const template = templateRow
    ? {
        fileName: templateRow.fileName,
        uploadedByName: templateRow.uploadedByName,
        createdAt: templateRow.createdAt,
      }
    : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title={t.payment.template}>
        <TemplateForm t={t} locale={locale} current={template} />
      </Panel>
      <Panel title={t.payment.expenseAccount}>
        <ExpenseAccountForm t={t} members={members} currentId={expenseAccountId} />
      </Panel>
    </div>
  );
}

function staffAccounts() {
  return db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      role: users.role,
      active: users.active,
      systemDeveloper: users.systemDeveloper,
    })
    .from(users)
    .orderBy(users.role, users.name);
}

function deletedRows() {
  return db
    .select({
      id: deletedEvents.id,
      name: deletedEvents.name,
      date: deletedEvents.date,
      deletedAt: deletedEvents.deletedAt,
      deletedByName: deletedEvents.deletedByName,
    })
    .from(deletedEvents)
    .orderBy(desc(deletedEvents.deletedAt));
}
