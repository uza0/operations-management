import { Skeleton } from '@/components/ui/states';

/**
 * What the admin area looks like while a page is being fetched.
 *
 * Without this, tapping "Events" on a weak connection leaves the previous
 * screen on display, unresponsive, until the next one is ready — which reads
 * as a dead tap and gets tapped again. The skeleton is not decoration: it is
 * the acknowledgement, and it appears the instant the link is pressed.
 *
 * It deliberately mirrors the usual shape of these pages — a heading, a row of
 * figures, a list — so the real content lands roughly where the eye is already
 * looking instead of shoving it somewhere else.
 */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}
