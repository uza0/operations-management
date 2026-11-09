'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { approveTeamPhotoAction } from '@/server/actions/team';
import type { TeamRow } from './TeamManager';

export function TeamPhotoCell({ member, labels }: { member: Pick<TeamRow, 'id' | 'fullName' | 'photoUrl' | 'pendingPhotoUrl'>; labels: { upload: string; approve: string; pending: string; error: string } }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const initials = member.fullName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('');

  async function upload(file?: File) {
    if (!file) return;
    setError(false);
    setBusy(true);
    try {
      const data = new FormData();
      data.set('file', file);
      data.set('memberId', member.id);
      const result = await fetch('/api/member/photo', { method: 'POST', body: data });
      if (!result.ok) throw new Error('Upload failed');
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="flex min-w-[140px] items-center gap-2">
      <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-ink-600 bg-ink-800 text-xs font-bold text-brand-300">
        {member.pendingPhotoUrl || member.photoUrl ? <img src={member.pendingPhotoUrl ?? member.photoUrl!} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 object-cover" /> : initials}
      </div>
      <div className="flex min-w-0 flex-col items-start gap-1">
        {member.pendingPhotoUrl ? <>
          <span className="text-[10px] text-warn-text">{labels.pending}</span>
          <form action={approveTeamPhotoAction}><input type="hidden" name="memberId" value={member.id} /><button className="text-[11px] font-semibold text-brand-300 hover:underline">{labels.approve}</button></form>
        </> : null}
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="text-[11px] text-ink-400 hover:text-ink-100">{busy ? '…' : labels.upload}</button>
        {error ? <span className="text-[10px] text-crit-text">{labels.error}</span> : null}
        <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void upload(event.currentTarget.files?.[0])} />
      </div>
    </div>
  );
}
