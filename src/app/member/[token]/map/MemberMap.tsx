'use client';

import dynamic from 'next/dynamic';

import type { StageMarker } from '@/components/map/MapStage';

const MapStage = dynamic(
  () => import('@/components/map/MapStage').then((m) => m.MapStage),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] w-full animate-pulseSoft rounded-lg border border-ink-700 bg-ink-900" />
    ),
  },
);

/** Read-only map for the member: pan and zoom, no editing. */
export function MemberMap({
  imageUrl,
  markers,
  failedTitle,
  failedHint,
}: {
  imageUrl: string;
  markers: StageMarker[];
  failedTitle: string;
  failedHint: string;
}) {
  return (
    <MapStage
      imageUrl={imageUrl}
      markers={markers}
      height={520}
      responsiveHeight
      draggable={false}
      failedTitle={failedTitle}
      failedHint={failedHint}
    />
  );
}
