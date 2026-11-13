'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The venue map as a picture, or nothing at all.
 *
 * A picture that fails to load used to leave its frame behind: a white box
 * with the browser's torn-page icon in the corner, at the very top of a
 * promoter's page, on a phone with one bar of signal at a stadium — which is
 * exactly where pictures fail. A map that is not there helps nobody find a
 * gate, so when it does not arrive the whole section steps aside and the
 * page begins with what did.
 */
export function MapImagePreview({ title, url }: { title: string; url: string }) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);

  // The picture is in the HTML the server sent, so on a quick failure the
  // error has come and gone before this component is listening for it. Ask
  // the element once it is ours: finished loading, and nothing to show.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) return null;

  return (
    <section className="panel overflow-hidden p-3 sm:p-4">
      <h2 className="mb-3 text-[14px] font-semibold text-ink-100">{title}</h2>
      <a href={url} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={img}
          src={url}
          alt={title}
          onError={() => setFailed(true)}
          className="max-h-[72vh] w-full rounded-card border border-ink-700 bg-white object-contain"
        />
      </a>
    </section>
  );
}
