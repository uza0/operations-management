'use client';

import type { Dictionary } from '@/lib/i18n';

/**
 * Saving the report.
 *
 * The browser's own print dialogue is the PDF writer here, and deliberately
 * so: it already has the Arabic fonts installed, it already lays the page
 * out right-to-left, and it hands the reader a file named after the report
 * without this system carrying a PDF library it would otherwise never use.
 */
export function PrintButton({ t }: { t: Dictionary }) {
  return (
    <button type="button" className="btn-primary btn-sm" onClick={() => window.print()}>
      {t.insights.print}
    </button>
  );
}
