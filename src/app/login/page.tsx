import { redirect } from 'next/navigation';

import { getT } from '@/lib/i18n/server';
import { currentUser, homeFor } from '@/server/auth/rbac';
import { LocaleSwitcher } from '@/components/ui/client';
import { IconInfo } from '@/components/ui/icons';
import { BrandMark } from '@/components/ui/BrandMark';

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

  /**
   * The demo credentials are a convenience while the app runs on a laptop.
   * On a deployed site the login page is public, so printing passwords on it
   * would hand the whole system to anyone with the link — the block is off in
   * production unless SHOW_DEMO_ACCOUNTS=1 says otherwise, and it reads the
   * seeded values from the environment so it can never show stale ones.
   */
  const showDemo =
    process.env.SHOW_DEMO_ACCOUNTS === '1' || process.env.NODE_ENV !== 'production';
  const demo = [
    {
      role: t.enums.role.ADMIN,
      user: process.env.SEED_ADMIN_USERNAME ?? 'admin',
      pass: process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345',
    },
    {
      role: t.enums.role.TEAM_LEADER,
      user: process.env.SEED_LEADER_USERNAME ?? 'ahmed',
      pass: process.env.SEED_LEADER_PASSWORD ?? 'Leader@12345',
    },
    {
      role: t.enums.role.GATE_LEADER,
      user: 'hussein',
      pass: process.env.SEED_GATELEADER_PASSWORD ?? 'Gate@12345',
    },
  ];

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/*
        The backdrop: two brand washes breathing against each other on
        half-minute cycles, out of phase so the light never settles and never
        arrives anywhere. Each is its own layer because two gradients in one
        background cannot be animated apart, and the whole thing is decoration
        — `aria-hidden`, and held still entirely for anyone who has asked their
        device for less motion.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.17] will-change-transform"
        style={{
          backgroundImage:
            'radial-gradient(circle at 18% 12%, #e4584a 0, transparent 46%)',
          animation: 'drift 26s var(--ease-soft) infinite',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.15] will-change-transform"
        style={{
          backgroundImage:
            'radial-gradient(circle at 84% 82%, #921f15 0, transparent 44%)',
          animation: 'driftAlt 34s var(--ease-soft) infinite',
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

      <div className="stagger relative w-full max-w-[420px]">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandMark size={44} className="text-brand-600" />
            <div>
              <p
                className="text-[17px] font-bold leading-tight text-ink-100"
                style={{ unicodeBidi: 'plaintext' }}
              >
                {t.app.name}
              </p>
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

        {showDemo ? (
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
        ) : null}
      </div>
    </div>
  );
}
