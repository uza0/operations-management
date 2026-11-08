'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import type { Dictionary } from '@/lib/i18n';
import type { Role } from '@/lib/constants';
import { createAccountAction, changeAccountRoleAction, deleteAccountAction, setSystemDeveloperAction } from '@/server/actions/auth';
import { idle } from '@/server/actions/types';
import { FormError, Notice } from '@/components/ui/states';
import { ConfirmSubmit, SubmitButton } from '@/components/ui/client';
import { Badge } from '@/components/ui/status';
import { format } from '@/lib/i18n';

const roles: Role[] = ['ADMIN', 'TEAM_LEADER', 'GATE_LEADER'];

export function AccountManager({
  t,
  accounts,
  currentUserId,
}: {
  t: Dictionary;
  accounts: { id: string; username: string; name: string; role: string; active: boolean; systemDeveloper: boolean }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [state, action] = useActionState(createAccountAction, idle);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-3 rounded-xl border border-ink-800 p-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="account-name">{t.auth.accountName}</label>
          <input id="account-name" name="name" className="field" required maxLength={100} />
        </div>
        <div>
          <label className="field-label" htmlFor="account-username">{t.auth.accountUsername}</label>
          <input id="account-username" name="username" className="field nums" required minLength={3} maxLength={32} pattern="[a-zA-Z0-9._-]+" dir="ltr" />
        </div>
        <div>
          <label className="field-label" htmlFor="account-role">{t.auth.accountRole}</label>
          <select id="account-role" name="role" className="field" defaultValue="TEAM_LEADER">
            {roles.map((role) => <option key={role} value={role}>{t.enums.role[role]}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <SubmitButton className="btn-primary btn-sm" pendingLabel={t.common.saving}>{t.auth.createAccount}</SubmitButton>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-200 sm:col-span-2">
          <input type="checkbox" name="systemDeveloper" className="h-4 w-4 accent-brand-500" />
          {t.auth.grantSystemDeveloper}
        </label>
        {state.status === 'error' ? <div className="sm:col-span-2"><FormError message={state.message} /></div> : null}
        {state.status === 'success' ? (
          <div className="sm:col-span-2 space-y-2">
            <Notice tone="ok">{t.auth.temporaryPasswordHint}</Notice>
            <p className="text-sm text-ink-200">{t.auth.accountCreated}</p>
            <code dir="ltr" className="inline-block rounded-lg bg-ink-900 px-3 py-2 font-mono text-base text-brand-300">{state.message?.replace(`${t.auth.accountCreated} `, '')}</code>
          </div>
        ) : null}
      </form>

      <div className="table-wrap">
        <table className="op-table op-table-stack">
          <thead><tr><th>{t.common.name}</th><th>{t.auth.username}</th><th>{t.enums.auditEntity.USER}</th><th>{t.common.status}</th><th>{t.common.actions}</th></tr></thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td data-label="" className="font-medium text-ink-100">{account.name}</td>
                <td data-label={t.auth.username} dir="ltr" className="nums text-ink-300">{account.username}</td>
                <td data-label={t.enums.auditEntity.USER}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="brand">{t.enums.role[account.role as Role]}</Badge>
                    {account.systemDeveloper ? <Badge tone="ok">{t.auth.systemDeveloper}</Badge> : null}
                  </div>
                </td>
                <td data-label={t.common.status}><Badge tone={account.active ? 'ok' : 'neutral'}>{account.active ? t.team.active : t.team.inactive}</Badge></td>
                <td data-label={t.common.actions}>
                  {account.id === currentUserId ? <span className="text-sm text-ink-500">{t.auth.currentAccountProtected}</span> : (
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={changeAccountRoleAction} className="flex items-center gap-2">
                        <input type="hidden" name="userId" value={account.id} />
                        <select name="role" defaultValue={account.role} aria-label={`${t.auth.accountRole}: ${account.name}`} className="field min-h-10 max-w-52 py-1.5">
                          {roles.map((role) => <option key={role} value={role}>{t.enums.role[role]}</option>)}
                        </select>
                        <button type="submit" className="btn-secondary btn-sm">{t.auth.saveRole}</button>
                      </form>
                      <form action={setSystemDeveloperAction} className="flex items-center gap-2">
                        <input type="hidden" name="userId" value={account.id} />
                        <label className="flex items-center gap-1.5 text-xs text-ink-300">
                          <input type="checkbox" name="systemDeveloper" defaultChecked={account.systemDeveloper} className="h-4 w-4 accent-brand-500" />
                          {t.auth.systemDeveloper}
                        </label>
                        <button type="submit" className="btn-secondary btn-sm">{t.common.save}</button>
                      </form>
                      <form action={deleteAccountAction}>
                        <input type="hidden" name="userId" value={account.id} />
                        <ConfirmSubmit message={format(t.auth.deleteAccountConfirm, { name: account.name })} className="btn-danger btn-sm">
                          {t.auth.deleteAccount}
                        </ConfirmSubmit>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
