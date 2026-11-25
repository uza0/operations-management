/* eslint-disable @next/next/no-img-element -- rendered to an image; next/image would not be inlined */
import type { CSSProperties, ReactNode } from 'react';
import type { MemberCardStats } from '@/server/services/member-card';
import { ROLE_NAME } from './roles';

/*
 * The six story cards from the "ملف عضو فريق تكت زون" design canvas, at
 * their real size (1080 × 1920). They are drawn as ordinary markup and turned
 * into a picture in the member's own browser, which is what shapes Arabic
 * properly; a server image renderer does not join Arabic letters.
 */

export const DESIGNS = ['poster', 'upcoming', 'badge', 'passport', 'season', 'sticker', 'crew', 'ticket'] as const;
export type Design = (typeof DESIGNS)[number];
export type CardLang = 'ar' | 'en';

const RED = '#E5533D';
const LOGO = '/icons/icon-192.png';
const FONT = "'Alexandria', 'IBM Plex Sans Arabic', sans-serif";
const AR_LETTERS = /[؀-ۿ]/;

const COPY = {
  ar: {
    events: 'فعالية', venues: 'موقع', since: 'عضو منذ', team1: 'فريق', team2: 'تكت زون', team: 'فريق تكت زون',
    city: 'بغداد', passport: 'جواز الفعاليات', holder: 'صاحب الجواز', stamps: 'ختم', next: 'الجاية',
    passFoot: 'فريق تكت زون · ختم لكل فعالية تشتغلها', season: 'موسم', with: 'وية تكت زون',
    worked: 'فعالية اشتغلتها', hours: 'ساعة بالميدان', chairs: 'يوم ترتيب كراسي', fav: 'مكانك المفضل',
    titleLabel: 'لقبك هالموسم', titleOf: (p: string) => `نجم ${p}`, titleNone: 'من فريق الموسم',
    stickerTop: 'خلفية شفافة: تحطه فوق صورتك من الحفلة', wasOn: 'كنت بالفريق', allGates: 'دخول كل البوابات',
    memberFrom: (y: string) => `عضو من ${y} · بغداد`, eventsFrom: (n: number, y: string) => `${n} فعالية · من ${y}`,
    roleNone: 'فريق تكت زون', promoter: 'بروموتر', logo: 'شعار تكت زون',
    willBe1: 'راح أكون', willBe2: 'هناك', was1: 'كنت', wasOnCrew: 'كنت ويه فريق التنظيم', ago: (n: number) => (n === 1 ? 'البارحة' : n === 2 ? 'قبل يومين' : n <= 10 ? `قبل ${n} أيام` : `قبل ${n} يوم`), tonight: 'الليلة', tomorrow: 'باچر', inDays: (n: number) => (n === 2 ? 'بعد يومين' : n <= 10 ? `بعد ${n} أيام` : `بعد ${n} يوم`), onCrew: 'ويه فريق التنظيم',
  },
  en: {
    events: 'Events', venues: 'Venues', since: 'Since', team1: 'Ticket Zone', team2: 'Team', team: 'Ticket Zone Team',
    city: 'Baghdad', passport: 'Event Passport', holder: 'Passport holder', stamps: 'stamps', next: 'Next',
    passFoot: 'Ticket Zone Team · a stamp for every event you work', season: 'Season', with: 'with Ticket Zone',
    worked: 'events worked', hours: 'hours on the ground', chairs: 'chair setup days', fav: 'Your favourite venue',
    titleLabel: 'Your title this season', titleOf: (p: string) => (AR_LETTERS.test(p) ? 'Crew Star' : `${p} Star`),
    titleNone: 'Season Crew',
    stickerTop: 'Transparent background: place it on your event photo', wasOn: 'I was on the crew', allGates: 'All gates access',
    memberFrom: (y: string) => `Member since ${y} · Baghdad`, eventsFrom: (n: number, y: string) => `${n} ${n === 1 ? 'event' : 'events'} · since ${y}`,
    roleNone: 'Ticket Zone Crew', promoter: 'Promoter', logo: 'Ticket Zone logo',
    willBe1: 'See you', willBe2: 'there', was1: 'I was', wasOnCrew: 'I was on the event crew', ago: (n: number) => (n === 1 ? 'Yesterday' : `${n} days ago`), tonight: 'Tonight', tomorrow: 'Tomorrow', inDays: (n: number) => `In ${n} days`, onCrew: 'On the event crew',
  },
} as const;

/** "2026-11-20" → "20.11" or "20.11.2026". */
const dmy = (iso: string | null, year = false) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return year ? `${Number(d)}.${m}.${y}` : `${Number(d)}.${m}`;
};

const TYPE_NAME: Record<string, { ar: string; en: string }> = {
  FOOTBALL_MATCH: { ar: 'مباراة', en: 'Match' },
  CONCERT: { ar: 'حفلة', en: 'Concert' },
  THEATER: { ar: 'مسرحية', en: 'Play' },
  COMEDY: { ar: 'عرض كوميدي', en: 'Comedy show' },
  FESTIVAL: { ar: 'مهرجان', en: 'Festival' },
  EXHIBITION: { ar: 'معرض', en: 'Exhibition' },
  CONFERENCE: { ar: 'مؤتمر', en: 'Conference' },
  WORKSHOP: { ar: 'ورشة', en: 'Workshop' },
  PROMOTIONAL: { ar: 'فعالية', en: 'Event' },
  OTHER: { ar: 'فعالية', en: 'Event' },
};

/** Days from today in Baghdad to "YYYY-MM-DD", counted in the viewer's browser when the card is drawn. */
function daysUntil(iso: string): number {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [ty, tm, td] = today.split('-').map(Number);
  const a = Date.UTC(ty, tm - 1, td);
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - a) / 86_400_000);
}

function dateParts(iso: string, lang: CardLang) {
  const [y, m, d] = iso.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d, 12));
  const loc = lang === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-GB';
  return {
    day: String(d),
    month: new Intl.DateTimeFormat(loc, { month: 'long', timeZone: 'UTC' }).format(at),
    weekday: new Intl.DateTimeFormat(loc, { weekday: 'long', timeZone: 'UTC' }).format(at),
  };
}

function clock(hhmm: string, lang: CardLang) {
  const [h, mm] = hhmm.split(':').map(Number);
  const h12 = ((h + 11) % 12) + 1;
  return lang === 'ar' ? `${h12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}` : `${h12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const root = (extra: CSSProperties): CSSProperties => ({
  width: 1080, height: 1920, boxSizing: 'border-box', fontFamily: FONT, position: 'relative', overflow: 'hidden', ...extra,
});
const p = (style: CSSProperties, children: ReactNode) => <p style={{ margin: 0, ...style }}>{children}</p>;

function Face({ stats, size, ring, bg = '#f6e3dc', font }: { stats: MemberCardStats; size: number; ring?: string; bg?: string; font: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: RED, fontSize: font, fontWeight: 800, border: ring, boxSizing: 'border-box', flex: 'none' }}>
      {stats.photoUrl ? <img src={stats.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : stats.initials}
    </div>
  );
}

function FakeCode({ size, ink }: { size: number; ink: string }) {
  return (
    <svg viewBox="0 0 21 21" width={size} height={size} aria-hidden="true">
      <rect width="21" height="21" fill="#ffffff" />
      <path fill={ink} d="M0 0h7v7H0zM2 2v3h3V2zM14 0h7v7h-7zM16 2v3h3V2zM0 14h7v7H0zM2 16v3h3v-3zM9 0h2v2H9zM9 4h3v2H9zM8 8h5v2H8zM14 9h2v3h-2zM18 9h3v2h-3zM9 12h3v2H9zM10 16h2v5h-2zM14 14h3v3h-3zM18 13h3v2h-3zM17 18h4v3h-4zM13 19h2v2h-2zM0 9h3v2H0zM4 10h2v2H4z" />
    </svg>
  );
}

const BARS = (() => {
  // A fixed, decorative pattern: the same bars on every card.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out: { x: number; w: number }[] = [];
  for (let x = 0; x < 600; ) {
    const w = [4, 6, 8, 10, 14][Math.floor(rnd() * 5)];
    if (rnd() < 0.62) out.push({ x, w });
    x += w + [4, 6, 8][Math.floor(rnd() * 3)];
  }
  return out;
})();

export function StoryCard({ design, lang, stats }: { design: Design; lang: CardLang; stats: MemberCardStats }) {
  const c = COPY[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const start = lang === 'ar' ? 'right' : 'left';
  const end = lang === 'ar' ? 'left' : 'right';
  const roleName = stats.role ? ROLE_NAME[lang][stats.role] : undefined;
  const role = roleName ?? (stats.role && !/^[A-Z_]+$/.test(stats.role) && (lang === 'ar' || !AR_LETTERS.test(stats.role)) ? stats.role : c.roleNone);
  const logo = (size: number, extra: CSSProperties = {}) => (
    <img src={LOGO} alt={c.logo} style={{ width: size, height: size, borderRadius: size * 0.22, flex: 'none', ...extra }} />
  );

  if (design === 'poster' && stats.next?.posterUrl) {
    /*
     * The organiser's own poster, with his place in it underneath: the
     * story people actually post the night before a show.
     */
    const n = stats.next;
    const parts = dateParts(n.date, lang);
    const left = daysUntil(n.date);
    const when = n.past ? (left >= 0 ? c.tonight : c.ago(-left)) : left <= 0 ? c.tonight : left === 1 ? c.tomorrow : c.inDays(left);
    return (
      <div dir={dir} style={root({ background: '#121317', color: '#fff', display: 'flex', flexDirection: 'column' })}>
        <div style={{ position: 'relative', height: 1080, flex: 'none' }}>
          <img src={n.posterUrl!} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 20%' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(18,19,23,0) 62%, #121317 100%)' }} />
          {p({ position: 'absolute', bottom: 150, [start]: 76, fontSize: 36, fontWeight: 800, background: RED, borderRadius: 50, padding: '12px 34px', boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }, when)}
        </div>
        <div style={{ position: 'relative', marginTop: -110, padding: '0 76px', display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 24, flexWrap: 'wrap' }}>
            {p({ fontSize: 118, fontWeight: 900, lineHeight: 1 }, n.past ? c.was1 : c.willBe1)}
            <p style={{ margin: 0, fontSize: 118, fontWeight: 900, lineHeight: 1.05, background: RED, padding: '0 34px 12px', borderRadius: 32 }}>{c.willBe2}</p>
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'stretch', gap: 36 }}>
            <div style={{ width: 220, flex: 'none', background: '#fff', color: '#121317', borderRadius: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '22px 0' }}>
              {p({ fontSize: 116, fontWeight: 900, lineHeight: 0.95, color: RED }, parts.day)}
              {p({ marginTop: 6, fontSize: 28, fontWeight: 800 }, parts.month)}
            </div>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
              {p({ fontSize: n.name.length > 18 ? 58 : 70, fontWeight: 900, lineHeight: 1.1 }, n.name)}
              {p({ fontSize: 36, fontWeight: 500, color: '#cfcfcf' }, `${parts.weekday} · ${clock(n.startTime, lang)}`)}
              {p({ fontSize: 36, fontWeight: 500, color: '#cfcfcf' }, n.venue)}
            </div>
          </div>
          <div style={{ marginTop: 'auto', marginBottom: 80, display: 'flex', alignItems: 'center', gap: 26, background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.14)', borderRadius: 40, padding: '26px 32px' }}>
            <div style={{ width: 120, height: 120, borderRadius: '50%', border: `5px solid ${RED}`, overflow: 'hidden', flex: 'none' }}><Face stats={stats} size={110} font={44} /></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              {p({ fontSize: 44, fontWeight: 800 }, stats.name)}
              {p({ marginTop: 4, fontSize: 28, fontWeight: 500, color: '#bdbdbd' }, n.past ? c.wasOnCrew : c.onCrew)}
            </div>
            {logo(96)}
          </div>
        </div>
      </div>
    );
  }

  if (design === 'upcoming' && stats.next) {
    const n = stats.next;
    const parts = dateParts(n.date, lang);
    const left = daysUntil(n.date);
    const when = n.past ? (left >= 0 ? c.tonight : c.ago(-left)) : left <= 0 ? c.tonight : left === 1 ? c.tomorrow : c.inDays(left);
    const type = (TYPE_NAME[n.type] ?? TYPE_NAME.OTHER)[lang];
    return (
      <div dir={dir} style={root({ background: '#121317', color: '#fff', padding: '90px 76px', display: 'flex', flexDirection: 'column' })}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 2px, transparent 2px)', backgroundSize: '44px 44px' }} />
        <div style={{ position: 'absolute', top: -300, [end]: -300, width: 860, height: 860, borderRadius: '50%', background: RED }} />
        <div style={{ position: 'absolute', top: -160, [end]: -160, width: 580, height: 580, borderRadius: '50%', border: '6px solid #121317' }} />
        <div style={{ position: 'absolute', top: -40, [end]: -40, width: 340, height: 340, borderRadius: '50%', border: '6px solid #121317' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 20 }}>
          {logo(96)}
          {p({ fontSize: 30, fontWeight: 700, letterSpacing: 4, direction: 'ltr' }, 'TICKET ZONE · CREW')}
        </div>
        <div style={{ position: 'relative', marginTop: 190 }}>
          {p({ fontSize: 150, fontWeight: 900, lineHeight: 1 }, n.past ? c.was1 : c.willBe1)}
          <p style={{ display: 'inline-block', margin: '18px 0 0', fontSize: 150, fontWeight: 900, lineHeight: 1.05, background: RED, padding: '0 40px 14px', borderRadius: 36 }}>{c.willBe2}</p>
        </div>
        <p style={{ position: 'relative', alignSelf: 'flex-start', margin: '44px 0 0', fontSize: 40, fontWeight: 700, border: '4px solid #fff', borderRadius: 60, padding: '12px 36px' }}>{when}</p>
        <div style={{ position: 'relative', marginTop: 'auto', background: '#fff', color: '#121317', borderRadius: 48, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            <div style={{ width: 300, flex: 'none', background: RED, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
              {p({ fontSize: 160, fontWeight: 900, lineHeight: 0.95 }, parts.day)}
              {p({ marginTop: 10, fontSize: 36, fontWeight: 800 }, parts.month)}
              {p({ marginTop: 4, fontSize: 30, fontWeight: 500 }, parts.weekday)}
            </div>
            <div style={{ padding: '44px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18, minWidth: 0 }}>
              {p({ fontSize: 30, fontWeight: 700, color: RED }, type)}
              {p({ fontSize: n.name.length > 18 ? 52 : 64, fontWeight: 900, lineHeight: 1.1 }, n.name)}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 32, fontWeight: 500, color: '#44413c' }}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
                <span>{n.venue}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 32, fontWeight: 500, color: '#44413c' }}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                <span>{clock(n.startTime, lang)}</span>
              </div>
            </div>
          </div>
          <div style={{ borderTop: '5px dashed #e2ddd6', margin: '0 40px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '34px 48px' }}>
            <div>{p({ fontSize: 44, fontWeight: 800 }, stats.name)}{p({ marginTop: 4, fontSize: 28, fontWeight: 500, color: '#6b6862' }, n.past ? c.wasOnCrew : c.onCrew)}</div>
            {p({ fontSize: 30, fontWeight: 800, letterSpacing: 4, color: '#fff', background: '#121317', borderRadius: 40, padding: '12px 30px' }, 'CREW')}
          </div>
        </div>
        {p({ position: 'relative', marginTop: 40, textAlign: 'center', fontSize: 30, fontWeight: 500, color: '#b9b9b9' }, `${c.team} · ${c.city}`)}
      </div>
    );
  }

  if (design === 'badge') {
    return (
      <div dir={dir} style={root({ background: '#121317', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center' })}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 2px, transparent 2px)', backgroundSize: '44px 44px' }} />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 76, height: 400, background: '#dcdcdc', borderRadius: '0 0 10px 10px' }} />
          <div style={{ width: 64, height: 64, border: '12px solid #b9b9b9', borderRadius: '50%', marginTop: -26, boxSizing: 'border-box' }} />
          <div style={{ width: 26, height: 70, background: '#b9b9b9', borderRadius: 8, marginTop: -6 }} />
          <div style={{ width: 680, marginTop: -14, background: '#e3b596', borderRadius: 56, padding: 30, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <div style={{ width: 170, height: 40, background: '#121317', borderRadius: 20 }} />
            <div style={{ width: 620, background: RED, borderRadius: 28, padding: '64px 48px 56px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
              <div style={{ width: 300, height: 300, borderRadius: '50%', background: '#fff', padding: 12, boxSizing: 'border-box' }}>
                <Face stats={stats} size={276} font={110} />
              </div>
              <div style={{ textAlign: 'center' }}>
                {p({ fontSize: 72, fontWeight: 800, lineHeight: 1.15 }, stats.name)}
                <p style={{ display: 'inline-block', margin: '18px 0 0', background: '#fff', color: '#8f2a1c', fontSize: 36, fontWeight: 700, padding: '10px 36px', borderRadius: 40 }}>{c.promoter}</p>
              </div>
              <div style={{ width: '100%', borderTop: '3px dashed rgba(255,255,255,0.55)' }} />
              <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center' }}>
                {[[stats.events, c.events], [stats.venues, c.venues], [stats.since, c.since]].map(([v, l]) => (
                  <div key={String(l)}>{p({ fontSize: 72, fontWeight: 900, lineHeight: 1 }, v)}{p({ marginTop: 10, fontSize: 28, fontWeight: 500 }, l)}</div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
                {logo(72)}
                <div>{p({ fontSize: 46, fontWeight: 800, lineHeight: 1.05 }, c.team1)}{p({ fontSize: 46, fontWeight: 800, lineHeight: 1.05 }, c.team2)}</div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 90, left: 0, width: 1080, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 28 }}>
          <div style={{ width: 120, height: 120, background: '#fff', borderRadius: 18, padding: 14, boxSizing: 'border-box' }}><FakeCode size={92} ink="#121317" /></div>
          <div>{p({ fontSize: 34, fontWeight: 700 }, c.team)}{p({ marginTop: 6, fontSize: 28, color: '#c9c9c9', direction: 'ltr', textAlign: start }, `${c.city} · ${stats.code}`)}</div>
        </div>
      </div>
    );
  }

  if (design === 'passport') {
    const shown = stats.stamps.slice(0, 11);
    const rots = [-10, 7, -4, 9, -7, 5, -9, 6, -3, 8, -6];
    return (
      <div dir={dir} style={root({ background: RED, padding: '80px 64px', display: 'flex', flexDirection: 'column', gap: 34 })}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff' }}>
          <div>{p({ fontSize: 28, fontWeight: 500, letterSpacing: 4 }, 'ALL ACCESS · CREW')}{p({ marginTop: 8, fontSize: 72, fontWeight: 900, lineHeight: 1.05 }, c.passport)}</div>
          {logo(116)}
        </div>
        <div style={{ background: '#fbf3ee', borderRadius: 40, padding: '48px 44px', display: 'flex', flexDirection: 'column', gap: 30, flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>{p({ fontSize: 26, color: '#8f2a1c', fontWeight: 500 }, c.holder)}{p({ marginTop: 6, fontSize: 56, color: '#2a0f0a', fontWeight: 800 }, stats.name)}</div>
            <div style={{ textAlign: end }}>{p({ fontSize: 88, color: RED, fontWeight: 900, lineHeight: 1 }, stats.events)}{p({ marginTop: 4, fontSize: 26, color: '#8f2a1c', fontWeight: 500 }, c.stamps)}</div>
          </div>
          <div style={{ borderTop: '4px dashed #ecc4b9' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', rowGap: 30 }}>
            {shown.map((s, i) => (
              <div key={`${s.date}-${i}`} style={{ width: 230, height: 230, border: `8px solid ${RED}`, borderRadius: '50%', padding: 9, boxSizing: 'border-box', transform: `rotate(${rots[i]}deg)`, justifySelf: 'center' }}>
                <div style={{ width: '100%', height: '100%', border: `3px solid ${RED}`, borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#b8392a', gap: 2 }}>
                  {p({ fontSize: 18, fontWeight: 700, letterSpacing: 2 }, 'CREW')}
                  {p({ fontSize: s.name.length > 14 ? 21 : 25, fontWeight: 800, lineHeight: 1.15, padding: '0 14px' }, s.name)}
                  {p({ fontSize: 22, fontWeight: 500 }, dmy(s.date))}
                </div>
              </div>
            ))}
            {shown.length < 12 ? (
              <div style={{ width: 230, height: 230, border: '5px dashed #e8b6aa', borderRadius: '50%', justifySelf: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d99485', fontSize: 26, fontWeight: 500 }}>{c.next}</div>
            ) : null}
          </div>
          {p({ marginTop: 'auto', textAlign: 'center', fontSize: 28, color: '#8f2a1c', fontWeight: 500, direction: 'ltr' }, `${dmy(stats.firstDate, true)} – ${dmy(stats.lastDate, true)}`)}
        </div>
        {p({ textAlign: 'center', color: '#fff', fontSize: 32, fontWeight: 700 }, c.passFoot)}
      </div>
    );
  }

  if (design === 'season') {
    const first = stats.name.split(/\s+/)[0];
    return (
      <div dir={dir} style={root({ background: '#f7ebe4', color: '#2a0f0a', padding: '100px 80px', display: 'flex', flexDirection: 'column' })}>
        <div style={{ position: 'absolute', top: lang === 'ar' ? -260 : -340, [end]: lang === 'ar' ? -260 : -380, width: 760, height: 760, borderRadius: '50%', background: RED }} />
        <div style={{ position: 'absolute', top: lang === 'ar' ? 120 : 40, [end]: lang === 'ar' ? 60 : -60, width: 420, height: 420, borderRadius: '50%', border: '6px solid #f7ebe4' }} />
        <div style={{ position: 'relative' }}>
          {p({ fontSize: 34, fontWeight: 500, color: '#8f2a1c' }, `${c.season} ${(stats.lastDate ?? '').slice(0, 4)}`)}
          {p({ marginTop: 10, fontSize: 60, fontWeight: 800, lineHeight: 1.2 }, <>{first}<br />{c.with}</>)}
        </div>
        <div style={{ position: 'relative', marginTop: 170 }}>
          {p({ fontSize: 360, fontWeight: 900, lineHeight: 0.9, color: RED }, stats.events)}
          {p({ marginTop: 10, fontSize: 56, fontWeight: 700 }, c.worked)}
        </div>
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 80 }}>
          <div style={{ background: '#fff', borderRadius: 32, padding: '36px 40px' }}>{p({ fontSize: 80, fontWeight: 900, lineHeight: 1 }, stats.hours > 0 ? `+${stats.hours}` : '—')}{p({ marginTop: 12, fontSize: 28, color: '#8f2a1c', fontWeight: 500 }, c.hours)}</div>
          <div style={{ background: '#fff', borderRadius: 32, padding: '36px 40px' }}>{p({ fontSize: 80, fontWeight: 900, lineHeight: 1 }, stats.chairDays)}{p({ marginTop: 12, fontSize: 28, color: '#8f2a1c', fontWeight: 500 }, c.chairs)}</div>
          {stats.favouriteVenue ? (
            <div style={{ background: '#fff', borderRadius: 32, padding: '36px 40px', gridColumn: 'span 2', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}>
              <div>{p({ fontSize: 28, color: '#8f2a1c', fontWeight: 500 }, c.fav)}{p({ marginTop: 10, fontSize: stats.favouriteVenue.name.length > 22 ? 40 : 50, fontWeight: 800 }, stats.favouriteVenue.name)}</div>
              {p({ fontSize: 40, fontWeight: 800, color: RED }, `×${stats.favouriteVenue.count}`)}
            </div>
          ) : null}
        </div>
        <div style={{ position: 'relative', marginTop: 'auto', background: '#2a0f0a', color: '#fff', borderRadius: 40, padding: '48px 56px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <div>{p({ fontSize: 30, color: '#f5c4b3', fontWeight: 500 }, c.titleLabel)}{p({ marginTop: 8, fontSize: 62, fontWeight: 900 }, stats.topPost ? c.titleOf(stats.topPost) : c.titleNone)}</div>
          {logo(130)}
        </div>
      </div>
    );
  }

  if (design === 'sticker') {
    const last = stats.last;
    return (
      <div dir={dir} style={root({ backgroundColor: 'transparent' })}>
        <div style={{ position: 'absolute', top: 1060, [start]: 150, width: 780, transform: `rotate(${lang === 'ar' ? -5 : 5}deg)`, background: RED, color: '#fff', borderRadius: 44, border: '10px solid #fff', padding: '48px 56px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {p({ fontSize: 34, fontWeight: 500 }, c.wasOn)}
            {p({ fontSize: 26, fontWeight: 700, letterSpacing: 3, border: '3px solid #fff', borderRadius: 30, padding: '6px 20px' }, 'CREW')}
          </div>
          {p({ marginTop: 18, fontSize: (last?.name.length ?? 0) > 20 ? 58 : 72, fontWeight: 900, lineHeight: 1.1 }, last?.name ?? '')}
          {p({ marginTop: 18, fontSize: 32, fontWeight: 500 }, `${dmy(last?.date ?? null, true)} · ${last?.venue ?? ''}`)}
          {last?.post ? <p style={{ display: 'inline-block', margin: '14px 0 0', fontSize: 28, fontWeight: 700, background: '#fff', color: '#8f2a1c', borderRadius: 30, padding: '6px 22px' }}>{last.post}</p> : null}
          <div style={{ marginTop: 28, paddingTop: 24, borderTop: '3px dashed rgba(255,255,255,0.6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {p({ fontSize: 38, fontWeight: 800 }, stats.name)}
            {logo(64)}
          </div>
        </div>
        <div style={{ position: 'absolute', top: 860, [end]: 110, width: 250, height: 250, borderRadius: '50%', background: '#121317', border: '10px solid #fff', boxSizing: 'border-box', transform: 'rotate(12deg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          {p({ fontSize: 30, fontWeight: 800, letterSpacing: 4 }, 'STAFF')}
          {p({ marginTop: 6, fontSize: 56, fontWeight: 900, color: '#f5a08f', lineHeight: 1 }, `#${stats.events}`)}
          {p({ marginTop: 6, fontSize: 22, fontWeight: 500 }, c.events)}
        </div>
      </div>
    );
  }

  if (design === 'crew') {
    return (
      <div dir={dir} style={root({ background: '#c9c9cc', display: 'flex', flexDirection: 'column', alignItems: 'center' })}>
        <div style={{ width: 90, height: 150, background: '#1d2027' }} />
        <div style={{ width: 150, height: 90, border: '16px solid #1d2027', borderTop: 0, borderRadius: '0 0 70px 70px', boxSizing: 'border-box', marginTop: -10 }} />
        <div style={{ width: 880, height: 1580, marginTop: 10, background: '#a9a9ad', borderRadius: 30, padding: 30, boxSizing: 'border-box' }}>
          <div style={{ width: 820, height: 1520, background: '#fff', borderRadius: 16, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 640, background: '#1d2027', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -240, [end]: -180, width: 820, height: 820, borderRadius: '50%', background: RED }} />
              <div style={{ position: 'relative', padding: '70px 60px 0', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', color: '#fff' }}>
                {logo(110)}
                {p({ marginTop: 28, fontSize: 34, fontWeight: 500, letterSpacing: 3, direction: 'ltr' }, `TICKET ZONE · ${stats.code}`)}
                {p({ marginTop: 6, fontSize: 88, fontWeight: 900, lineHeight: 1.02 }, <>{c.team1}<br />{c.team2}</>)}
              </div>
            </div>
            <div style={{ position: 'absolute', top: 470, left: 250, width: 320, height: 320, borderRadius: '50%', background: '#fff', padding: 14, boxSizing: 'border-box', border: `6px solid ${RED}` }}>
              <Face stats={stats} size={280} font={100} />
            </div>
            <div style={{ marginTop: 170, textAlign: 'center', color: '#1d2027' }}>
              {p({ fontSize: 66, fontWeight: 800 }, stats.name)}
              {p({ marginTop: 8, fontSize: 36, fontWeight: 500, color: '#5f5e5a' }, role)}
            </div>
            <div style={{ marginTop: 50, display: 'flex', height: 140 }}>
              <div style={{ width: 330, background: RED, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: lang === 'ar' ? '0 70px 70px 0' : '70px 0 0 70px', fontSize: 70, fontWeight: 900, letterSpacing: 4, position: 'relative', zIndex: 1 }}>CREW</div>
              <div style={{ flex: 1, background: '#b8392a', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 40px', ...(lang === 'ar' ? { marginRight: -70, paddingRight: 110 } : { marginLeft: -70, paddingLeft: 110 }) }}>
                {p({ fontSize: 38, fontWeight: 800 }, c.allGates)}
                {p({ marginTop: 4, fontSize: 26, fontWeight: 500 }, 'ALL ACCESS')}
              </div>
            </div>
            <div style={{ margin: '50px auto 0', background: '#1d2027', color: '#fff', borderRadius: 14, padding: '18px 50px', textAlign: 'center' }}>
              {p({ fontSize: 38, fontWeight: 800 }, c.eventsFrom(stats.events, stats.since))}
              {p({ marginTop: 4, fontSize: 26, fontWeight: 500, color: '#d3d1c7' }, c.city)}
            </div>
            <div style={{ marginTop: 'auto', background: '#1d2027', borderTop: `10px solid ${RED}`, padding: '34px 60px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff' }}>
              <div>{p({ fontSize: 32, fontWeight: 700, direction: 'ltr', textAlign: start }, `CREW · ${stats.code}`)}{p({ marginTop: 6, fontSize: 26, color: '#d3d1c7' }, `${c.team} · ${c.city}`)}</div>
              <div style={{ width: 130, height: 130, background: '#fff', borderRadius: 14, padding: 14, boxSizing: 'border-box' }}><FakeCode size={102} ink="#1d2027" /></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ticket
  return (
    <div dir={dir} style={root({ background: '#121317', display: 'flex', alignItems: 'center', justifyContent: 'center' })}>
      <div style={{ position: 'absolute', top: 140, right: -120, width: 520, height: 520, borderRadius: '50%', border: '3px solid rgba(229,83,61,0.5)' }} />
      <div style={{ position: 'absolute', bottom: 160, left: -160, width: 600, height: 600, borderRadius: '50%', border: '3px solid rgba(229,83,61,0.35)' }} />
      <div style={{ position: 'relative', width: 820, transform: 'rotate(-3deg)' }}>
        <div style={{ background: RED, borderRadius: '44px 44px 0 0', padding: '64px 60px 56px', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {logo(100, { border: '4px solid #fff' })}
            {p({ fontSize: 30, fontWeight: 700, letterSpacing: 4, direction: 'ltr' }, stats.code)}
          </div>
          {p({ marginTop: 50, fontSize: 150, fontWeight: 900, lineHeight: 0.95, letterSpacing: 2, direction: 'ltr', textAlign: start }, 'CREW')}
          {p({ marginTop: 8, fontSize: 46, fontWeight: 500, letterSpacing: 6, direction: 'ltr', textAlign: start }, 'TEAM PASS')}
          <div style={{ marginTop: 50, display: 'flex', alignItems: 'center', gap: 26 }}>
            <Face stats={stats} size={190} bg="#fff" font={70} />
            <div>{p({ fontSize: 58, fontWeight: 800, lineHeight: 1.1 }, stats.name)}{p({ marginTop: 8, fontSize: 34, fontWeight: 500 }, role)}</div>
          </div>
        </div>
        <div style={{ background: '#fff', padding: '44px 60px', display: 'flex', alignItems: 'center', gap: 30, color: '#121317' }}>
          <div style={{ background: RED, color: '#fff', borderRadius: 20, width: 170, height: 170, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            {p({ fontSize: 80, fontWeight: 900, lineHeight: 1 }, stats.events)}{p({ marginTop: 6, fontSize: 24, fontWeight: 500 }, c.events)}
          </div>
          <div>{p({ fontSize: 44, fontWeight: 800 }, c.team)}{p({ marginTop: 8, fontSize: 30, fontWeight: 500, color: '#5f5e5a' }, c.memberFrom(stats.since))}</div>
        </div>
        <div style={{ position: 'relative', height: 0 }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 80, height: 80, borderRadius: '50%', background: '#121317' }} />
          <div style={{ position: 'absolute', top: -40, left: -40, width: 80, height: 80, borderRadius: '50%', background: '#121317' }} />
          <div style={{ position: 'absolute', top: -3, right: 60, left: 60, borderTop: '6px dashed #d3d1c7' }} />
        </div>
        <div style={{ background: '#fff', borderRadius: '0 0 44px 44px', padding: '56px 60px 50px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <svg viewBox="0 0 600 120" width={600} height={120} aria-hidden="true">
            {BARS.map((b) => <rect key={b.x} x={b.x} y={0} width={b.w} height={120} fill="#121317" />)}
          </svg>
          {p({ fontSize: 26, fontWeight: 500, letterSpacing: 8, color: '#5f5e5a', direction: 'ltr' }, stats.code)}
        </div>
      </div>
    </div>
  );
}
