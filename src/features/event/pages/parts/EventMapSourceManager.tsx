'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { MapUploader } from '@/components/venue/MapUploader';
import { FormError } from '@/components/ui/states';
import { SubmitButton, useDict } from '@/components/ui/client';
import { saveEventMapLinkAction } from '@/server/actions/event-map';
import { idle } from '@/server/actions/types';

type Source = 'image' | 'pdf' | 'link' | 'none';

export function EventMapSourceManager({
  eventId,
  initialSource,
  linkUrl,
}: {
  eventId: string;
  initialSource: Source;
  linkUrl: string | null;
}) {
  const t = useDict();
  const router = useRouter();
  const [source, setSource] = useState<Exclude<Source, 'none'>>(
    initialSource === 'none' ? 'image' : initialSource,
  );
  const [linkState, linkAction] = useActionState(saveEventMapLinkAction, idle);

  useEffect(() => {
    if (linkState.status === 'success') router.refresh();
  }, [linkState, router]);

  useEffect(() => {
    if (initialSource !== 'none') setSource(initialSource);
  }, [initialSource]);

  const options: Array<{ id: Exclude<Source, 'none'>; label: string }> = [
    { id: 'image', label: t.map.mapSourceImage },
    { id: 'pdf', label: t.map.mapSourcePdf },
    { id: 'link', label: t.map.mapSourceLink },
  ];
  const currentSourceLabel =
    initialSource === 'image'
      ? t.map.sourceImage
      : initialSource === 'pdf'
        ? t.map.sourcePdf
        : initialSource === 'link'
          ? t.map.sourceLink
          : null;

  return (
    <section className="panel mb-4 space-y-3 p-4" aria-labelledby="event-map-source-title">
      <div>
        <h2 id="event-map-source-title" className="text-[14px] font-semibold text-ink-100">
          {t.map.mapSourceTitle}
        </h2>
        {initialSource !== 'none' ? (
          <p className="mt-1 text-[12.5px] text-ink-400">
            {t.map.currentMapSource}: {currentSourceLabel}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t.map.mapSourceTitle}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={source === option.id}
            onClick={() => setSource(option.id)}
            className={`btn-sm rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
              source === option.id
                ? 'border-brand-500 bg-brand-600 text-white'
                : 'border-ink-700 bg-ink-900 text-ink-300 hover:text-ink-100'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {source === 'image' ? (
        <MapUploader
          eventId={eventId}
          kind="image"
          label={t.map.chooseMapImage}
          hint={t.map.mapImageHint}
          className="btn-primary btn-sm"
        />
      ) : null}

      {source === 'pdf' ? (
        <MapUploader
          eventId={eventId}
          kind="pdf"
          label={t.map.chooseMapPdf}
          hint={t.map.mapPdfHint}
          className="btn-primary btn-sm"
        />
      ) : null}

      {source === 'link' ? (
        <form action={linkAction} className="space-y-2.5">
          <input type="hidden" name="eventId" value={eventId} />
          <label className="block">
            <span className="label">{t.map.mapLinkLabel}</span>
            <input
              type="url"
              name="mapLinkUrl"
              className="field"
              dir="ltr"
              maxLength={2048}
              placeholder={t.map.mapLinkPlaceholder}
              defaultValue={linkUrl ?? ''}
              required
            />
          </label>
          <p className="text-[12.5px] leading-5 text-ink-500">{t.map.mapLinkHint}</p>
          <FormError message={linkState.status === 'error' ? linkState.message : null} />
          {linkState.status === 'success' ? (
            <p className="text-[12.5px] text-ok-text" role="status">{linkState.message}</p>
          ) : null}
          <SubmitButton className="btn-primary btn-sm">{t.map.saveMapLink}</SubmitButton>
        </form>
      ) : null}
    </section>
  );
}
