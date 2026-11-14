'use client';

import { useRef, useState } from 'react';

import { format, type Dictionary } from '@/lib/i18n';

const KEEP_OPTIONS = [1, 3, 7, 14, 30];

/**
 * Shrinks a photo on the phone before it is sent.
 *
 * A camera photo is three or four megabytes; the server only keeps a fraction
 * of that anyway. Sending the fraction instead is the difference between a
 * second and a minute on a venue's network. If the browser cannot do it, the
 * original goes and the server shrinks it.
 */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export function AnnouncementImagePicker({ t }: { t: Dictionary }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const clear = () => {
    if (input.current) input.current.value = '';
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  };

  return (
    <div className="space-y-2">
      <label className="field-label" htmlFor="an-image">
        {t.announcement.image} <span className="text-ink-500">({t.common.optional})</span>
      </label>
      <input
        ref={input}
        id="an-image"
        name="image"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="block w-full text-[13px] text-ink-300 file:me-3 file:rounded-full file:border-0 file:bg-ink-800 file:px-4 file:py-2 file:text-[13px] file:font-semibold file:text-ink-100"
        onChange={async (event) => {
          const picked = event.target.files?.[0];
          if (preview) URL.revokeObjectURL(preview);
          if (!picked) return setPreview(null);
          setBusy(true);
          const small = await shrink(picked);
          // Put the smaller file back into the field the form submits.
          try {
            const swap = new DataTransfer();
            swap.items.add(small);
            if (input.current) input.current.files = swap.files;
          } catch {
            /* Older browsers keep the original; the server shrinks it. */
          }
          setPreview(URL.createObjectURL(small));
          setBusy(false);
        }}
      />
      <p className="text-[12px] text-ink-500">{t.announcement.imageHint}</p>

      {preview ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt=""
            className="max-h-48 rounded-control border border-ink-700 object-contain"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[13px] text-ink-300" htmlFor="an-image-days">
              {t.announcement.imageKeep}
            </label>
            <select id="an-image-days" name="imageDays" className="field w-auto py-1.5" defaultValue="7">
              {KEEP_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {format(t.announcement.imageDays, { n })}
                </option>
              ))}
              <option value="0">{t.announcement.imageKeepForever}</option>
            </select>
            <button type="button" className="btn-ghost btn-sm" onClick={clear} disabled={busy}>
              {t.announcement.imageRemove}
            </button>
          </div>
        </div>
      ) : busy ? (
        <p className="text-[12px] text-ink-500">{t.common.saving}</p>
      ) : null}
    </div>
  );
}
