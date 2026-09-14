import Link from 'next/link';

import { getT } from '@/lib/i18n/server';
import { getMemberPortal } from '@/server/services/member';
import { IconArrowRight } from '@/components/ui/icons';
import { MARKER_STYLE, type MarkerType } from '@/lib/constants';

import { InvalidToken } from '../MemberShell';
import { MemberMap } from './MemberMap';

/** The member's own map: their gate is highlighted, everything else is context. */
export default async function MemberMapPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { t } = await getT();
  const data = await getMemberPortal(token);

  if (!data || data.cancelled || data.expired) {
    return <InvalidToken title={t.member.invalidToken} hint={t.member.invalidTokenHint} />;
  }

  if (!data.mapImageUrl) {
    return <InvalidToken title={t.map.noMap} hint={t.map.noMapHint} />;
  }

  const myLocationId = data.assignment?.gateId ?? data.assignment?.workingPointId ?? null;
  const locationName =
    data.assignment?.gateName ?? data.assignment?.workingPointName ?? null;

  const markers = data.markers.map((m) => {
    const linkedId = m.gateId ?? m.workingPointId ?? null;
    const mine = Boolean(myLocationId) && linkedId === myLocationId;
    return {
      id: m.id,
      type: m.type,
      name: mine ? `${m.name} — ${t.map.yourLocation}` : m.name,
      x: m.x,
      y: m.y,
      highlight: mine,
      dimmed: Boolean(myLocationId) && !mine,
    };
  });

  const usedTypes = Array.from(new Set(data.markers.map((m) => m.type))) as MarkerType[];

  return (
    <div className="min-h-screen bg-ink-950">
      <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[900px] items-center gap-3">
          <Link href={`/member/${token}`} className="btn-ghost btn-sm">
            <IconArrowRight width={17} height={17} className="rtl:rotate-180" />
            {t.member.backToAssignment}
          </Link>
          <div className="min-w-0 flex-1 text-end">
            <p className="truncate text-[14px] font-semibold text-ink-100">
              {data.membership.venueName}
            </p>
            {locationName ? (
              <p className="truncate text-[12px] text-brand-300">
                {t.map.yourLocation}: {locationName}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[900px] space-y-3 px-3 py-3">
        <MemberMap
          imageUrl={data.mapImageUrl}
          markers={markers}
          failedTitle={t.map.imageFailed}
          failedHint={t.map.imageFailedHint}
        />

        <p className="text-center text-[12px] text-ink-500">{t.map.dragHint}</p>

        <div className="panel p-4">
          <p className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-500">
            {t.map.legend}
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {usedTypes.map((type) => (
              <li key={type} className="flex items-center gap-2 text-[13px] text-ink-300">
                <span
                  aria-hidden
                  className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-ink-950"
                  style={{ background: (MARKER_STYLE[type] ?? MARKER_STYLE.OTHER).color }}
                >
                  {(MARKER_STYLE[type] ?? MARKER_STYLE.OTHER).glyph}
                </span>
                {t.enums.markerType[type] ?? type}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
