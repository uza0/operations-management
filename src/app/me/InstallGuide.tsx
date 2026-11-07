'use client';

import { useState } from 'react';

import type { Dictionary } from '@/lib/i18n';

type Platform = 'ios' | 'android' | 'desktop';

/**
 * How to put this on a phone, in the three places people actually ask about.
 *
 * Written out rather than left to the browser's own prompt, because iOS has
 * no prompt at all — Safari's Share sheet is the only way in, and a promoter
 * who has never done it will not find it by guessing. The tabs are there so
 * nobody reads two sets of steps that are not theirs.
 */
export function InstallGuide({ t }: { t: Dictionary }) {
  const [tab, setTab] = useState<Platform>('ios');

  const steps: Record<Platform, string[]> = {
    ios: t.memberAuth.stepsIos,
    android: t.memberAuth.stepsAndroid,
    desktop: t.memberAuth.stepsDesktop,
  };

  const labels: Record<Platform, string> = {
    ios: t.memberAuth.iphone,
    android: t.memberAuth.android,
    desktop: t.memberAuth.desktop,
  };

  return (
    <section className="rounded-card border border-ink-700 bg-ink-900 p-4">
      <p className="text-[13.5px] font-semibold text-ink-200">{t.memberAuth.installTitle}</p>
      <p className="mt-1 text-[12.5px] leading-5 text-ink-400">{t.memberAuth.installWhy}</p>

      <div
        role="tablist"
        className="mt-3 grid grid-cols-3 gap-1 rounded-card border border-ink-700 bg-ink-850 p-1"
      >
        {(['ios', 'android', 'desktop'] as const).map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            data-install-tab={key}
            onClick={() => setTab(key)}
            className={
              tab === key
                ? 'rounded-[10px] bg-brand px-2 py-2 text-[12.5px] font-semibold text-white'
                : 'rounded-[10px] px-2 py-2 text-[12.5px] font-medium text-ink-400 hover:text-ink-200'
            }
          >
            {labels[key]}
          </button>
        ))}
      </div>

      <ol className="mt-3 space-y-2">
        {steps[tab].map((step, i) => (
          <li key={step} className="flex gap-2.5 text-[12.5px] leading-5 text-ink-300">
            <span className="nums mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[12px] font-bold text-ink-400">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      {tab === 'ios' ? (
        <p className="mt-3 text-[12px] leading-5 text-ink-500">{t.memberAuth.iosNote}</p>
      ) : null}
    </section>
  );
}
