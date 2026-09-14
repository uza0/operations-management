import { redirect } from 'next/navigation';

import { getT } from '@/lib/i18n/server';
import { currentUser, homeFor } from '@/server/auth/rbac';
import { LocaleSwitcher } from '@/components/ui/client';
import { IconInfo } from '@/components/ui/icons';

import { LoginForm } from './LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await currentUser();
  if (user) redirect(homeFor(user.role));

  const { locale, t } = await getT();
  const params = await searchParams;
  const next = params.next && params.next.startsWith('/') ? params.next : '';

  const demo = [
    { role: t.enums.role.ADMIN, user: 'admin', pass: 'Admin@12345' },
    { role: t.enums.role.TEAM_LEADER, user: 'ahmed', pass: 'Leader@12345' },
    { role: t.enums.role.GATE_LEADER, user: 'hussein', pass: 'Gate@12345' },
  ];

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 15%, #10b981 0, transparent 42%), radial-gradient(circle at 82% 78%, #2563eb 0, transparent 45%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.028) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
        }}
      />

      <div className="relative w-full max-w-[420px]">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-[17px] font-bold text-white"
            >
              OM
            </span>
            <div>
              <p className="text-[17px] font-bold leading-tight text-ink-100">{t.app.name}</p>
              <p className="text-[12px] text-ink-400">{t.app.tagline}</p>
            </div>
          </div>
          <LocaleSwitcher locale={locale} labels={{ ar: 'العربية', en: 'English' }} />
        </div>

        <div className="panel p-6">
          <h1 className="text-[19px] font-bold text-ink-100">{t.auth.loginTitle}</h1>
          <p className="mb-5 mt-1 text-[13px] text-ink-400">{t.auth.loginSubtitle}</p>

          <LoginForm t={t} next={next} />

          <p className="mt-4 flex items-start gap-2 text-[12.5px] leading-5 text-ink-500">
            <IconInfo width={15} height={15} className="mt-0.5 shrink-0" />
            {t.auth.memberHint}
          </p>
        </div>

        <div className="panel mt-4 p-4">
          <p className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-ink-500">
            {t.auth.demoAccounts}
          </p>
          <ul className="space-y-1.5">
            {demo.map((d) => (
              <li
                key={d.user}
                className="flex items-center justify-between gap-3 text-[13px]"
              >
                <span className="text-ink-400">{d.role}</span>
                <code className="nums rounded bg-ink-850 px-2 py-1 text-[12.5px] text-ink-200">
                  {d.user} / {d.pass}
                </code>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
