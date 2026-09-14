import type { ReactNode } from 'react';

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
  bodyClassName = '',
  id,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`panel ${className}`}>
      {title ? (
        <header className="panel-head">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-ink-100">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 text-[12.5px] text-ink-400">{subtitle}</p>
            ) : null}
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </header>
      ) : null}
      <div className={bodyClassName || 'p-4 sm:p-5'}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  breadcrumb,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-1.5">{breadcrumb}</div> : null}
        <h1 className="text-[22px] font-bold leading-tight text-ink-100 sm:text-[26px]">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-[13.5px] text-ink-400">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}

/** Compact metric tile used across dashboards. */
export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
  className = '',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'crit' | 'info';
  icon?: ReactNode;
  className?: string;
}) {
  const accent = {
    neutral: 'text-ink-100',
    ok: 'text-ok-text',
    warn: 'text-warn-text',
    crit: 'text-crit-text',
    info: 'text-info-text',
  }[tone];

  return (
    <div className={`panel p-4 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-medium text-ink-400">{label}</p>
        {icon ? <span className="text-ink-500">{icon}</span> : null}
      </div>
      <p className={`nums mt-2 text-[28px] font-bold leading-none ${accent}`}>{value}</p>
      {hint ? <p className="mt-1.5 text-[12px] text-ink-400">{hint}</p> : null}
    </div>
  );
}

export function KeyValue({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-800 py-2.5 last:border-0">
      <dt className="shrink-0 text-[13px] text-ink-400">{label}</dt>
      <dd className="text-end text-[14px] font-medium text-ink-100">{children}</dd>
    </div>
  );
}
