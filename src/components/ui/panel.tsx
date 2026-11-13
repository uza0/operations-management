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

/**
 * The figures of a page, on one band.
 *
 * These used to be a row of separate boxes, each with a number set very large
 * in the middle of it — five of them across the top of every screen, most of
 * them reading "0". A zero at that size says the same thing as an alarm, and
 * five boxes of equal weight say that nothing on the page matters more than
 * anything else.
 *
 * One band instead, parted by hairlines. The figures are still the first
 * thing read, but they read as a line of facts rather than as five
 * announcements, and the page below them gets to be the page.
 *
 * The hairlines are the band's own background showing through a one-pixel
 * gap, which is the only way to rule a wrapping grid without drawing a line
 * on the outside edge of whichever cell happens to end a row.
 */
const STRIP_COLS: Record<number, string> = {
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
};

export function StatStrip({
  children,
  cols = 4,
  className = '',
}: {
  children: ReactNode;
  cols?: 3 | 4 | 5;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-2 gap-px overflow-hidden rounded-card border border-ink-700 bg-ink-700 shadow-panel max-lg:[&>*:last-child:nth-child(odd)]:col-span-2 ${STRIP_COLS[cols]} ${className}`}
    >
      {children}
    </div>
  );
}

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
  /*
   * Nothing is not news. A zero keeps its place in the band so the figures
   * do not shuffle from one visit to the next, but it is set in the muted
   * ink whatever its tone: "0 open problems" in alarm red was the loudest
   * thing on a quiet night.
   */
  const nothing = value === 0 || value === '0';
  const accent = nothing
    ? 'text-ink-500'
    : {
        neutral: 'text-ink-100',
        ok: 'text-ok-text',
        warn: 'text-warn-text',
        crit: 'text-crit-text',
        info: 'text-info-text',
      }[tone];

  return (
    <div className={`bg-ink-900 px-4 py-3.5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-medium text-ink-400">{label}</p>
        {icon ? <span className="text-ink-500">{icon}</span> : null}
      </div>
      <p className={`display nums mt-1.5 text-[22px] font-bold leading-none ${accent}`}>{value}</p>
      {hint ? <p className="mt-1.5 truncate text-[12px] text-ink-400">{hint}</p> : null}
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
