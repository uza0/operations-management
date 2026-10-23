'use client';

import { useFormStatus } from 'react-dom';

import { BrandMark } from '@/components/ui/BrandMark';

/**
 * What the sign-in does while the server is thinking.
 *
 * Creating a session takes somewhere between 200ms and, on a stadium 3G
 * connection, several seconds. A spinner says "wait"; this says "you're in,
 * we're opening it" — the mark breathing at its own slow pace with two rings
 * opening out of it, over a veil that fades the form away rather than freezing
 * it. Nothing here spins, flashes or counts: the brief is calm, and calm means
 * one slow motion, not several fast ones.
 *
 * It must live inside the <form> — `useFormStatus` reports the submission of
 * the form above it in the tree, which is exactly the signal wanted and is why
 * this is a component rather than a prop threaded down from the page.
 */
export function SignInVeil({ label }: { label: string }) {
  const { pending } = useFormStatus();
  if (!pending) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950/80 backdrop-blur-sm"
      style={{ animation: 'fade var(--dur-enter) var(--ease-soft) backwards' }}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-5">
        <div className="relative grid h-20 w-20 place-items-center">
          {/* Two rings, half a cycle apart, so one is always opening. */}
          <span
            aria-hidden
            className="absolute inset-0 rounded-[28px] border-2 border-brand-500"
            style={{ animation: 'halo 2.6s var(--ease-soft) infinite' }}
          />
          <span
            aria-hidden
            className="absolute inset-0 rounded-[28px] border-2 border-brand-500"
            style={{ animation: 'halo 2.6s var(--ease-soft) 1.3s infinite' }}
          />
          <BrandMark
            size={64}
            className="relative text-brand-600"
          />
        </div>
        <p className="text-[14px] font-semibold text-ink-200">{label}</p>
      </div>
    </div>
  );
}
