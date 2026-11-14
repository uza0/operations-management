/**
 * An announcement's picture: full width, tap to open it whole.
 *
 * Lazy, because a page with several announcements should not spend a weak
 * connection on the ones below the fold before the text above has arrived.
 */
export function AnnouncementImage({ url, alt }: { url: string | null | undefined; alt: string }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2.5 block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="max-h-[420px] w-full rounded-control border border-ink-700 bg-ink-900 object-contain"
      />
    </a>
  );
}
