export function MapSourcePreview({
  title,
  fileUrl,
  linkUrl,
  openLinkLabel,
  downloadLabel,
  fallback,
}: {
  title: string;
  fileUrl?: string | null;
  linkUrl?: string | null;
  openLinkLabel: string;
  downloadLabel: string;
  fallback: string;
}) {
  if (linkUrl) {
    return (
      <section className="panel overflow-hidden p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14px] font-semibold text-ink-100">{title}</h2>
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary btn-sm"
          >
            {openLinkLabel}
          </a>
        </div>
        <iframe
          src={linkUrl}
          title={title}
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-forms allow-popups"
          className="h-[min(72vh,760px)] min-h-[420px] w-full rounded-card border border-ink-700 bg-white"
        />
        <p className="mt-2 text-[12px] text-ink-500">{fallback}</p>
      </section>
    );
  }

  if (fileUrl) {
    return (
      <section className="panel overflow-hidden p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14px] font-semibold text-ink-100">{title}</h2>
          <a href={fileUrl} download className="btn-secondary btn-sm">
            {downloadLabel}
          </a>
        </div>
        <iframe
          src={fileUrl}
          title={title}
          loading="lazy"
          className="h-[min(72vh,760px)] min-h-[420px] w-full rounded-card border border-ink-700 bg-white"
        />
      </section>
    );
  }

  return null;
}
