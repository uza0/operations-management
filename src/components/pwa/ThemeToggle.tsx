'use client';

import { useEffect, useState } from 'react';

import type { Dictionary } from '@/lib/i18n';

/**
 * Dark, light, or whatever the phone says.
 *
 * Three states rather than two, because "follow my device" is a real answer:
 * a supervisor whose phone switches to dark at sunset wants the app to do the
 * same without being asked. The choice is stored per browser — it is a comfort
 * setting, not an account setting, and the same person uses a bright laptop in
 * an office and a dark phone on a pitch on the same evening.
 *
 * The applying is done by the inline script in the document head, not here:
 * see `themeScript` below for why.
 */

export type Theme = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'ops-theme';

/**
 * Runs before the first paint, inlined in <head>.
 *
 * Without it the page renders with the default theme and then flips once React
 * hydrates — a white flash on a dark phone, which is exactly what someone
 * standing in a dark stadium does not want. Everything is wrapped in a
 * try/catch: a browser with storage blocked must still render the app.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Storage can be blocked entirely; following the device is a fine answer.
  }
  return 'system';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  try {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The theme still applies for this visit; only remembering it fails.
  }
}

const ORDER: Theme[] = ['system', 'light', 'dark'];

export function ThemeToggle({ t, className }: { t: Dictionary; className?: string }) {
  const [theme, setTheme] = useState<Theme>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
    setReady(true);
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    applyTheme(next);
  }

  const label =
    theme === 'light' ? t.theme.light : theme === 'dark' ? t.theme.dark : t.theme.system;

  return (
    <button
      type="button"
      onClick={cycle}
      className={className ?? 'btn-ghost btn-sm'}
      aria-label={`${t.theme.label}: ${label}`}
      title={`${t.theme.label}: ${label}`}
    >
      {/* Until the stored choice is read, the icon alone — rendering a label
          on the server that the client then contradicts is a hydration error. */}
      <ThemeIcon theme={theme} />
      <span className="hidden sm:inline">{ready ? label : t.theme.label}</span>
    </button>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === 'light') {
    return (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (theme === 'dark') {
    return (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  /*
   * "Follow the device" is a circle half light, half dark. Deliberately NOT a
   * globe: the language switcher next to it is a globe, and two identical
   * icons side by side is a button nobody presses on purpose.
   */
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" />
    </svg>
  );
}
