/* eslint-disable @next/next/no-img-element -- immutable /uploads/ images, already sized */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { IconCalendar, IconClock, IconPin } from '@/components/ui/icons';

type Row = { token: string; name: string; posterUrl: string | null; venue: string };
type Bits = { typeLabel: string; date: string; time: string; badges: ReactNode };

/*
 * Two looks for an evening that has a poster.
 *
 * His next evening is the big one: the poster fills the card and the details
 * sit on a dark fade at the bottom, the way the organiser's own post looks.
 * Every other evening is smaller: the same poster, blurred, becomes the
 * card's colour, with the poster itself beside the details. The blur is the
 * browser's, so it costs the server nothing.
 */
export function HeroPosterCard({ row, bits }: { row: Row; bits: Bits }) {
  return (
    <Link href={`/member/${row.token}`} className="relative block h-[300px] overflow-hidden rounded-card shadow-lg transition hover:brightness-110">
      <img src={row.posterUrl!} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: '50% 22%' }} />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/0 from-20% via-black/75 via-60% to-black/90" />
      <div className="absolute top-3 flex flex-wrap gap-1.5 rounded-full bg-black/55 p-1 backdrop-blur-md ltr:right-3 rtl:left-3">{bits.badges}</div>
      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
        <p className="text-[12.5px] font-semibold text-[#ff9b90]">{bits.typeLabel}</p>
        <h3 className="mt-0.5 line-clamp-2 text-[22px] font-bold leading-7">{row.name}</h3>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-white/90">
          <span className="flex items-center gap-1"><IconCalendar width={14} />{bits.date}</span>
          <span className="flex items-center gap-1"><IconClock width={14} />{bits.time}</span>
          <span className="flex min-w-0 items-center gap-1"><IconPin width={14} className="shrink-0" /><span className="truncate">{row.venue}</span></span>
        </div>
      </div>
    </Link>
  );
}

export function BlurPosterCard({ row, bits }: { row: Row; bits: Bits }) {
  return (
    <Link href={`/member/${row.token}`} className="relative block overflow-hidden rounded-card transition hover:brightness-110">
      <img aria-hidden src={row.posterUrl!} alt="" className="absolute -inset-8 h-[calc(100%+4rem)] w-[calc(100%+4rem)] max-w-none object-cover blur-2xl saturate-150" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/45 to-black/75" />
      <div className="relative flex items-center gap-3 p-3.5 text-white">
        <img src={row.posterUrl!} alt="" loading="lazy" className="h-[118px] w-[94px] shrink-0 rounded-xl border-2 border-white/20 object-cover shadow-xl" style={{ objectPosition: '50% 20%' }} />
        <div className="min-w-0 flex-1">
          <div className="inline-flex flex-wrap gap-1.5 rounded-full bg-black/45 p-1 backdrop-blur-md">{bits.badges}</div>
          <h3 className="mt-1.5 line-clamp-2 text-[16.5px] font-bold leading-6">{row.name}</h3>
          <p className="text-[12px] font-semibold text-[#ffd2cc]">{bits.typeLabel}</p>
          <div className="mt-1.5 space-y-1 text-[12px] text-white/90">
            <p className="flex items-center gap-1"><IconCalendar width={13} />{bits.date} · {bits.time}</p>
            <p className="flex min-w-0 items-center gap-1"><IconPin width={13} className="shrink-0" /><span className="truncate">{row.venue}</span></p>
          </div>
        </div>
      </div>
    </Link>
  );
}
