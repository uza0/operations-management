'use client';

/* eslint-disable @next/next/no-img-element -- an /uploads/ image, already sized */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconTrash, IconUpload } from '@/components/ui/icons';

type Labels = { upload: string; replace: string; remove: string; removeConfirm: string; error: string; tooLarge: string; working: string };

/**
 * One button: pick the organiser's poster and it is on every card. The
 * server shrinks it, so the supervisor never has to think about size.
 */
export function PosterUpload({ eventId, url, labels }: { eventId: string; url: string | null; labels: Labels }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function send(file: File) {
    if (file.size > 8 * 1024 * 1024) { setMessage(labels.tooLarge); return; }
    setBusy(true); setMessage('');
    try {
      const body = new FormData(); body.set('file', file);
      const res = await fetch(`/api/events/${eventId}/poster`, { method: 'POST', body });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch { setMessage(labels.error); } finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm(labels.removeConfirm)) return;
    setBusy(true); setMessage('');
    try {
      const res = await fetch(`/api/events/${eventId}/poster`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch { setMessage(labels.error); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      {url ? <img src={url} alt="" className="h-36 w-36 rounded-2xl border border-ink-700 object-cover shadow-md" /> : null}
      <div className="flex flex-col gap-2">
        <label className="btn-primary btn-sm inline-flex cursor-pointer items-center gap-2">
          <IconUpload width={15} height={15} />
          {busy ? labels.working : url ? labels.replace : labels.upload}
          <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) void send(f); }} />
        </label>
        {url ? <button type="button" disabled={busy} onClick={remove} className="btn-ghost btn-sm inline-flex items-center gap-2 text-crit-text"><IconTrash width={15} height={15} />{labels.remove}</button> : null}
        {message ? <p aria-live="polite" className="text-[12px] text-crit-text">{message}</p> : null}
      </div>
    </div>
  );
}
