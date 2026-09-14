'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { IconUpload } from '@/components/ui/icons';
import { FormError } from '@/components/ui/states';
import { useDict } from '@/components/ui/client';

/**
 * Uploads a map image to /api/uploads/map, which re-checks permissions and
 * attaches the result to the venue or the event.
 */
export function MapUploader({
  venueId,
  eventId,
  label,
  hint,
  className = 'btn-secondary btn-sm',
}: {
  venueId?: string;
  eventId?: string;
  label: string;
  hint?: string;
  className?: string;
}) {
  const t = useDict();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set('file', file);
      if (venueId) body.set('venueId', venueId);
      if (eventId) body.set('eventId', eventId);

      const response = await fetch('/api/uploads/map', { method: 'POST', body });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(
          data.error === 'TOO_LARGE'
            ? t.errors.uploadTooLarge
            : data.error === 'BAD_TYPE'
              ? t.errors.uploadType
              : t.errors.uploadFailed,
        );
        return;
      }
      router.refresh();
    } catch {
      setError(t.errors.uploadFailed);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <IconUpload width={15} height={15} />
        {busy ? t.common.saving : label}
      </button>
      {hint ? <p className="text-[12px] text-ink-500">{hint}</p> : null}
      <FormError message={error} />
    </div>
  );
}
