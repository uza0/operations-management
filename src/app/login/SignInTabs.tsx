'use client';

import { useState } from 'react';

import type { Dictionary } from '@/lib/i18n';

import { LoginForm } from './LoginForm';
import { MemberLoginForm } from './MemberLoginForm';

/**
 * One sign-in page, two kinds of people.
 *
 * The promoter's side is first because there are a hundred and twenty of them
 * and six of everybody else, and because a man standing outside a stadium
 * should not have to hunt for his own door.
 */
export function SignInTabs({ t, next }: { t: Dictionary; next: string }) {
  const [tab, setTab] = useState<'member' | 'staff'>(next ? 'staff' : 'member');

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        className="grid grid-cols-2 gap-1 rounded-card border border-ink-700 bg-ink-850 p-1"
      >
        {(['member', 'staff'] as const).map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            data-signin-tab={key}
            onClick={() => setTab(key)}
            className={
              tab === key
                ? 'rounded-[10px] bg-brand px-3 py-2 text-[13.5px] font-semibold text-white'
                : 'rounded-[10px] px-3 py-2 text-[13.5px] font-medium text-ink-400 hover:text-ink-200'
            }
          >
            {key === 'member' ? t.memberAuth.tab : t.memberAuth.staffTab}
          </button>
        ))}
      </div>

      {tab === 'member' ? (
        <>
          <p className="text-center text-[12.5px] leading-5 text-ink-400">
            {t.memberAuth.hint}
          </p>
          <MemberLoginForm t={t} />
        </>
      ) : (
        <LoginForm t={t} next={next} />
      )}
    </div>
  );
}
