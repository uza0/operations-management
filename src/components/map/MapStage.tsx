'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Image as KonvaImage, Layer, Stage, Text } from 'react-konva';
import type Konva from 'konva';

import { MARKER_STYLE, type MarkerType } from '@/lib/constants';

export type StageMarker = {
  id: string;
  type: string;
  name: string;
  /** Normalized 0..1 — never pixels (spec §7). */
  x: number;
  y: number;
  /** Optional second line, e.g. "3 / 5". */
  badge?: string | null;
  highlight?: boolean;
  dimmed?: boolean;
};

type Props = {
  imageUrl: string;
  markers: StageMarker[];
  selectedId?: string | null;
  draggable?: boolean;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onCanvasClick?: (x: number, y: number) => void;
  /** Fixed viewport height; the stage always fits the image's width. */
  height?: number;
  /**
   * Sizes the canvas from the viewport instead: a phone gets a shorter stage
   * so the toolbar and properties panel stay reachable without scrolling past
   * a 560px canvas.
   */
  responsiveHeight?: boolean;
  labels?: boolean;
  /** Shown when the map image itself cannot be loaded. */
  failedTitle?: string;
  failedHint?: string;
};

const MIN_SCALE = 0.4;
const MAX_SCALE = 6;

/**
 * The shared canvas. Pan by dragging the background, zoom with the wheel or
 * the buttons in MapCanvas; markers are placed from normalized coordinates so
 * the same data renders identically on a phone and a desktop.
 */
export function MapStage({
  imageUrl,
  markers,
  selectedId,
  draggable = false,
  onSelect,
  onMove,
  onCanvasClick,
  height = 560,
  responsiveHeight = false,
  labels = true,
  failedTitle = 'تعذّر تحميل صورة الخريطة',
  failedHint = 'قد تكون الصورة محذوفة أو تالفة. ارفع صورة الخريطة مرة أخرى.',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [boxHeight, setBoxHeight] = useState(height);
  const [size, setSize] = useState({ width: 900, height });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });

  // Load the map bitmap ourselves so we know its natural aspect ratio.
  useEffect(() => {
    const img = new window.Image();
    setImage(null);
    setFailed(false);
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      // A file that decodes to nothing (a broken or dimensionless SVG) would
      // divide the layout by zero and draw an empty canvas — treat it as a
      // failure rather than showing a blank box.
      if (img.width > 0 && img.height > 0) setImage(img);
      else setFailed(true);
    };
    // Without this the component sat on its loading placeholder forever and
    // the map simply looked broken.
    img.onerror = () => setFailed(true);
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [imageUrl]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const measure = () => {
      const width = element.clientWidth;
      let next = height;

      if (responsiveHeight) {
        // Fit the image's own proportions rather than reserving a fixed block
        // and leaving empty bands above and below it on a narrow screen.
        const viewportCap = Math.round(window.innerHeight * 0.6);
        const natural = image ? Math.round((width * image.height) / image.width) : height;
        next = Math.max(280, Math.min(height, viewportCap, natural));
      }

      setBoxHeight(next);
      setSize({ width, height: next });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [height, responsiveHeight, image]);

  // Base layout: the image is letterboxed to fit the viewport at scale 1.
  const layout = useMemo(() => {
    if (!image) return { width: size.width, height: size.height, offsetX: 0, offsetY: 0 };
    const ratio = Math.min(size.width / image.width, size.height / image.height);
    const width = image.width * ratio;
    const h = image.height * ratio;
    return {
      width,
      height: h,
      offsetX: (size.width - width) / 2,
      offsetY: (size.height - h) / 2,
    };
  }, [image, size]);

  /** Below this rendered width the map is too small for text to sit apart. */
  const compactLabels = layout.width * view.scale < 560;

  const toStage = useCallback(
    (nx: number, ny: number) => ({
      x: layout.offsetX + nx * layout.width,
      y: layout.offsetY + ny * layout.height,
    }),
    [layout],
  );

  const toNormalized = useCallback(
    (sx: number, sy: number) => ({
      x: Math.min(Math.max((sx - layout.offsetX) / layout.width, 0), 1),
      y: Math.min(Math.max((sy - layout.offsetY) / layout.height, 0), 1),
    }),
    [layout],
  );

  const zoomBy = useCallback(
    (factor: number, pointer?: { x: number; y: number }) => {
      setView((current) => {
        const next = Math.min(Math.max(current.scale * factor, MIN_SCALE), MAX_SCALE);
        if (next === current.scale) return current;
        const origin = pointer ?? { x: size.width / 2, y: size.height / 2 };
        const worldX = (origin.x - current.x) / current.scale;
        const worldY = (origin.y - current.y) / current.scale;
        return {
          scale: next,
          x: origin.x - worldX * next,
          y: origin.y - worldY * next,
        };
      });
    },
    [size],
  );

  // Exposed to MapCanvas through a DOM event so the toolbar stays declarative.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ action: string }>).detail;
      if (detail.action === 'in') zoomBy(1.25);
      if (detail.action === 'out') zoomBy(0.8);
      if (detail.action === 'reset') setView({ scale: 1, x: 0, y: 0 });
    };
    element.addEventListener('map-zoom', handler);
    return () => element.removeEventListener('map-zoom', handler);
  }, [zoomBy]);

  return (
    <div
      ref={containerRef}
      data-map-stage
      className="relative w-full touch-none overflow-hidden rounded-lg border border-ink-700 bg-ink-950"
      style={{ height: boxHeight }}
    >
      {image ? (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          scaleX={view.scale}
          scaleY={view.scale}
          x={view.x}
          y={view.y}
          draggable
          onDragEnd={(e) => {
            if (e.target === e.target.getStage()) {
              setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
            }
          }}
          onWheel={(e) => {
            e.evt.preventDefault();
            const stage = e.target.getStage();
            const pointer = stage?.getPointerPosition() ?? undefined;
            zoomBy(e.evt.deltaY < 0 ? 1.12 : 0.89, pointer ?? undefined);
          }}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage() || e.target.attrs.name === 'map-image') {
              onSelect?.(null);
            }
          }}
          onClick={(e) => {
            if (!onCanvasClick) return;
            if (e.target.attrs.name !== 'map-image') return;
            const stage = e.target.getStage();
            const pointer = stage?.getPointerPosition();
            if (!pointer) return;
            const local = {
              x: (pointer.x - view.x) / view.scale,
              y: (pointer.y - view.y) / view.scale,
            };
            const normalized = toNormalized(local.x, local.y);
            onCanvasClick(normalized.x, normalized.y);
          }}
        >
          <Layer>
            <KonvaImage
              name="map-image"
              image={image}
              x={layout.offsetX}
              y={layout.offsetY}
              width={layout.width}
              height={layout.height}
              listening
            />
          </Layer>

          <Layer>
            {markers.map((marker) => {
              const style =
                MARKER_STYLE[marker.type as MarkerType] ?? MARKER_STYLE.OTHER;
              const point = toStage(marker.x, marker.y);
              const selected = selectedId === marker.id;
              const radius = marker.highlight ? 17 : 13;

              return (
                <Group
                  key={marker.id}
                  x={point.x}
                  y={point.y}
                  draggable={draggable}
                  opacity={marker.dimmed ? 0.35 : 1}
                  onDragEnd={(e) => {
                    const normalized = toNormalized(e.target.x(), e.target.y());
                    onMove?.(marker.id, normalized.x, normalized.y);
                  }}
                  onMouseDown={(e) => {
                    e.cancelBubble = true;
                    onSelect?.(marker.id);
                  }}
                  onTap={() => onSelect?.(marker.id)}
                >
                  {marker.highlight ? (
                    <Circle radius={radius + 9} fill={style.color} opacity={0.22} />
                  ) : null}
                  <Circle
                    radius={radius}
                    fill={style.color}
                    stroke={selected ? '#ffffff' : 'rgba(10,9,8,0.85)'}
                    strokeWidth={selected ? 3 : 2}
                    shadowColor="black"
                    shadowBlur={selected ? 10 : 4}
                    shadowOpacity={0.55}
                  />
                  <Text
                    text={style.glyph}
                    fontSize={marker.highlight ? 14 : 12}
                    fontStyle="bold"
                    fill="#1b1917"
                    width={radius * 2}
                    height={radius * 2}
                    offsetX={radius}
                    offsetY={radius}
                    align="center"
                    verticalAlign="middle"
                    listening={false}
                  />
                  {/*
                    On a phone the whole venue is scaled into ~390px, and at
                    that size every label collides with its neighbours. Labels
                    are dropped there and the glyph + legend carry the meaning;
                    the selected marker keeps its label, and zooming in brings
                    the rest back.
                  */}
                  {labels && (!compactLabels || marker.highlight || selected) ? (
                    <Text
                      text={marker.badge ? `${marker.name}  ·  ${marker.badge}` : marker.name}
                      fontSize={13}
                      fontStyle="600"
                      fill="#f0eeeb"
                      y={radius + 5}
                      offsetX={66}
                      width={132}
                      align="center"
                      // Neighbouring markers sit close on a stadium ring, so
                      // labels are clipped rather than allowed to collide.
                      wrap="none"
                      ellipsis
                      shadowColor="#0a0908"
                      shadowBlur={6}
                      shadowOpacity={1}
                      listening={false}
                    />
                  ) : null}
                </Group>
              );
            })}
          </Layer>
        </Stage>
      ) : failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-6 text-center">
          <p className="text-[13.5px] font-medium text-ink-200">{failedTitle}</p>
          <p className="max-w-sm text-[12.5px] leading-relaxed text-ink-500">{failedHint}</p>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[13px] text-ink-500">
          …
        </div>
      )}
    </div>
  );
}
