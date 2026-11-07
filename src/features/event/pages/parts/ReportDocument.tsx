import type { ReactNode } from 'react';

/**
 * The building blocks of a document, not of an app screen.
 *
 * The difference matters: a screen groups things into cards a person scans; a
 * report runs in numbered sections a person reads top to bottom, survives being
 * printed on A4, and can be handed to someone who was not there. Every piece
 * here is tuned for both the screen and the page.
 */

export function ReportSection({
  index,
  title,
  children,
  hint,
  visible = true,
}: {
  index: number;
  title: string;
  children: ReactNode;
  hint?: string;
  visible?: boolean;
}) {
  if (!visible) return null;
  return (
    <section className="report-section">
      <h2 className="report-h2">
        <span className="nums report-h2-num">{index}</span>
        {title}
      </h2>
      {hint ? <p className="report-hint">{hint}</p> : null}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** A fact and its value, on one line, the way a report states things. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="report-fact">
      <span className="report-fact-label">{label}</span>
      <span className="report-fact-value">{children}</span>
    </div>
  );
}

export function FactGrid({ children }: { children: ReactNode }) {
  return <div className="report-fact-grid">{children}</div>;
}

/** A numbered list of statements — the summary and the recommendations. */
export function Statements({ items, ordered = true }: { items: string[]; ordered?: boolean }) {
  const List = ordered ? 'ol' : 'ul';
  return (
    <List className={ordered ? 'report-ol' : 'report-ul'}>
      {items.map((text, i) => (
        <li key={i}>{text}</li>
      ))}
    </List>
  );
}

export function ReportTable({
  head,
  children,
}: {
  head: string[];
  children: ReactNode;
}) {
  return (
    <div className="report-table-wrap">
      <table className="report-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * A coverage bar that still means something in black and white.
 *
 * Printed reports lose colour, so the number is always written next to the bar
 * and the bar itself keeps a visible outline.
 */
export function CoverageBar({ value }: { value: number }) {
  return (
    <span className="report-bar" aria-hidden>
      <span className="report-bar-fill" style={{ width: `${Math.min(100, value)}%` }} />
    </span>
  );
}

/** Where a real report ends: who wrote it, who checked it, who approved it. */
export function SignatureBlock({
  labels,
  preparedBy,
}: {
  labels: { prepared: string; reviewed: string; approved: string; name: string; signature: string };
  preparedBy: string;
}) {
  const columns = [
    { role: labels.prepared, name: preparedBy },
    { role: labels.reviewed, name: '' },
    { role: labels.approved, name: '' },
  ];
  return (
    <div className="report-signatures">
      {columns.map((column) => (
        <div key={column.role} className="report-signature">
          <p className="report-signature-role">{column.role}</p>
          <p className="report-signature-line" />
          <p className="report-signature-meta">
            {labels.name}
            {column.name ? `: ${column.name}` : ''}
          </p>
          <p className="report-signature-line" />
          <p className="report-signature-meta">{labels.signature}</p>
        </div>
      ))}
    </div>
  );
}
