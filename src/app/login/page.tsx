import { redirect } from 'next/navigation';

import { getT } from '@/lib/i18n/server';
import { currentUser, homeFor } from '@/server/auth/rbac';
import { currentMember } from '@/server/services/member-auth';
import { LocaleSwitcher } from '@/components/ui/client';
import { IconInfo } from '@/components/ui/icons';
import { BrandMark } from '@/components/ui/BrandMark';

import { SignInTabs } from './SignInTabs';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; as?: string }>;
}) {
  const params = await searchParams;

  /*
   * "?as=member" is how somebody who is already signed in at the office adds
   * their promoter session without giving up the first. Two cookies, two
   * sessions, no crossing: the page just stops assuming that whoever is here
   * can only be one person at a time.
   */
  const adding = params.as === 'member';

  const user = await currentUser();
  if (user && !adding) redirect(homeFor(user.role));

  /* A promoter already signed in on this phone goes to his own page. */
  const member = await currentMember();
  if (member) redirect('/me');

  const { locale, t } = await getT();
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
        A plain page with the brand's own rule across the top of it.

        There used to be a ruled grid here with two coloured glows drifting
        behind it. It was handsome and it was everybody's: that exact
        backdrop is on a thousand sign-in pages, and a visitor who has seen
        it on ten of them reads the eleventh as a template before reading a
        word. The door to a working tool does not need atmosphere. It needs
        to say whose it is, once, and get out of the way of two fields.
      */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-brand-600" />

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

          <SignInTabs t={t} next={next} forceMember={adding} />

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
