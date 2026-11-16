'use client';

import type { ReactNode } from 'react';

import { printPage } from '@/lib/print';

/**
 * A link to a page that prints itself on arrival. A plain new tab in a normal
 * browser; handed to Chrome from the installed Android app, where printing
 * inside the app does nothing.
 */
export function PrintLink({
  href,
  className,
  title,
  children,
}: {
  href: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      title={title}
      onClick={(event) => {
        if (printPage(href)) event.preventDefault();
      }}
    >
      {children}
    </a>
  );
}
