'use client';

import '@fontsource/alexandria/400.css';
import '@fontsource/alexandria/500.css';
import '@fontsource/alexandria/700.css';
import '@fontsource/alexandria/800.css';
import '@fontsource/alexandria/900.css';

import { useRef, useState } from 'react';
import type { MemberCardStats } from '@/server/services/member-card';
import { DESIGNS, StoryCard, designAvailable, pickLabels, type CardLang, type Design } from './StoryCards';

type Copy = {
  share: string; save: string; working: string; failed: string; hint: string; pick: string;
  arabic: string; english: string; names: Record<Design, string>; stickerNote: string;
};

const SCALE = 0.3;

export function ShareStudio({ stats, copy, initialLang }: { stats: MemberCardStats; copy: Copy; initialLang: CardLang }) {
  const designs = DESIGNS.filter((d) => designAvailable(d, stats));
  const [design, setDesign] = useState<Design>(designs[0]);
  const [lang, setLang] = useState<CardLang>(initialLang);
  const [pick, setPick] = useState(0);
  const labels = pickLabels(design, stats, lang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const card = useRef<HTMLDivElement>(null);

  /*
   * The picture is made here, in the member's browser, from the card on
   * screen at its full 1080 × 1920. The first pass loads the fonts and the
   * logo into the copy the library draws from; the second is the one kept.
   */
  async function render(): Promise<Blob> {
    const node = card.current?.firstElementChild as HTMLElement | null;
    if (!node) throw new Error('no card');
    const { toBlob } = await import('html-to-image');
    await document.fonts.ready;
    const options = { width: 1080, height: 1920, pixelRatio: 1, cacheBust: true };
    await toBlob(node, options);
    const blob = await toBlob(node, options);
    if (!blob) throw new Error('empty');
    return blob;
  }

  async function run(mode: 'share' | 'save') {
    setBusy(true);
    setError(null);
    try {
      const blob = await render();
      const file = new File([blob], `ticketzone-${design}-${lang}.png`, { type: 'image/png' });
      if (mode === 'share' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(copy.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={copy.hint}>
        {designs.map((d) => (
          <button key={d} type="button" role="tab" aria-selected={d === design} onClick={() => { setDesign(d); setPick(0); }}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors ${d === design ? 'border-brand-400 bg-brand-500 text-white' : 'border-ink-700 bg-ink-850 text-ink-200 hover:border-ink-500'}`}>
            {copy.names[d]}
          </button>
        ))}
      </div>

      <div className="flex justify-center gap-2" role="group" aria-label={`${copy.arabic} / ${copy.english}`}>
        {(['ar', 'en'] as const).map((l) => (
          <button key={l} type="button" aria-pressed={l === lang} onClick={() => setLang(l)}
            className={`min-h-10 rounded-full border px-5 text-sm font-semibold ${l === lang ? 'border-ink-300 bg-ink-100 text-ink-950' : 'border-ink-700 text-ink-300'}`}>
            {l === 'ar' ? copy.arabic : copy.english}
          </button>
        ))}
      </div>

      {labels && labels.length > 1 ? (
        <label className="block">
          <span className="sr-only">{copy.pick}</span>
          <select value={pick} onChange={(e) => setPick(Number(e.target.value))} className="field min-h-11 w-full">
            {labels.map((label, i) => <option key={i} value={i}>{label}</option>)}
          </select>
        </label>
      ) : null}

      <div className="flex justify-center">
        <div dir="ltr" className="overflow-hidden rounded-2xl border border-ink-700 shadow-lg"
          style={{ width: 1080 * SCALE, height: 1920 * SCALE, background: design === 'sticker' ? 'repeating-conic-gradient(#d6d6d6 0 25%, #ececec 0 50%) 0 0 / 24px 24px' : undefined }}>
          <div ref={card} style={{ width: 1080, height: 1920, transform: `scale(${SCALE})`, transformOrigin: 'top left' }}>
            <StoryCard design={design} lang={lang} stats={stats} pick={pick} />
          </div>
        </div>
      </div>
      {design === 'sticker' ? <p className="text-center text-xs text-ink-400">{copy.stickerNote}</p> : null}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => run('share')} className="btn-primary min-h-12">{busy ? copy.working : copy.share}</button>
        <button type="button" disabled={busy} onClick={() => run('save')} className="btn-secondary min-h-12">{copy.save}</button>
      </div>
      {error ? <p role="alert" className="text-center text-sm text-crit-text">{error}</p> : null}
    </div>
  );
}
