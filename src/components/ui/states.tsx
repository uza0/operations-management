import type { ReactNode } from 'react';

import { IconAlert, IconInfo } from './icons';

/** Empty state: always says what the user can do next (spec §46). */
export function EmptyState({
  title,
  hint,
  action,
  icon,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full border border-ink-700 bg-ink-850 text-ink-400">
        {icon ?? <IconInfo width={20} height={20} />}
      </div>
      <p className="text-[15px] font-semibold text-ink-200">{title}</p>
      {hint ? <p className="max-w-md text-[13.5px] leading-6 text-ink-400">{hint}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center"
    >
      <div className="grid h-11 w-11 place-items-center rounded-full border border-crit/50 bg-crit/12 text-crit-text">
        <IconAlert width={20} height={20} />
      </div>
      <p className="text-[15px] font-semibold text-ink-100">{title}</p>
      {hint ? <p className="max-w-md text-[13.5px] leading-6 text-ink-400">{hint}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulseSoft rounded-lg bg-ink-800 ${className}`} />;
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

/** Inline form / action error. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-crit/45 bg-crit/12 px-3 py-2 text-[13.5px] text-crit-text"
    >
      <IconAlert width={16} height={16} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'crit' | 'ok';
  children: ReactNode;
}) {
  const map = {
    info: 'border-info/40 bg-info/10 text-info-text',
    warn: 'border-warn/40 bg-warn/10 text-warn-text',
    crit: 'border-crit/40 bg-crit/10 text-crit-text',
    ok: 'border-ok/40 bg-ok/10 text-ok-text',
  } as const;
  return (
    <div className={`rounded-lg border px-3.5 py-2.5 text-[13.5px] leading-6 ${map[tone]}`}>
      {children}
    </div>
  );
}
