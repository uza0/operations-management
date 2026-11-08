import { logoutAction } from '@/server/actions/auth';
import { ConfirmSubmit } from '@/components/ui/client';
import type { Dictionary } from '@/lib/i18n';
import { Panel } from '@/components/ui/panel';

export function LogoutPanel({ t }: { t: Dictionary }) {
  return (
    <Panel title={t.common.logout}>
      <p className="mb-3 text-sm text-ink-400">{t.auth.logoutHint}</p>
      <form action={logoutAction}>
        <ConfirmSubmit message={t.auth.logoutConfirm} className="btn-secondary btn-sm">
          {t.common.logout}
        </ConfirmSubmit>
      </form>
    </Panel>
  );
}
