'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconUpload } from '@/components/ui/icons';

export function ProfilePhotoUpload({ pending, labels }: { pending: boolean; labels: { upload: string; pending: string; error: string; tooLarge: string; success: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(formData: FormData) {
    const file = formData.get('file');
    if (file instanceof File && file.size > 3 * 1024 * 1024) {
      setMessage(labels.tooLarge);
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/member/photo', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('upload');
      setMessage(labels.success);
      router.refresh();
    } catch {
      setMessage(labels.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {pending ? <p className="text-[12px] leading-5 text-warn-text">{labels.pending}</p> : null}
      <form action={submit} className="flex flex-wrap items-center gap-2">
        <label className="btn-ghost btn-sm inline-flex cursor-pointer items-center gap-2">
          <IconUpload width={15} height={15} />
          {busy ? '…' : labels.upload}
          <input className="sr-only" name="file" type="file" accept="image/jpeg,image/png,image/webp" required disabled={busy} onChange={(e) => { const form = e.currentTarget.form; if (form) form.requestSubmit(); }} />
        </label>
      </form>
      {message ? <p aria-live="polite" className="text-[12px] text-ink-300">{message}</p> : null}
    </div>
  );
}
