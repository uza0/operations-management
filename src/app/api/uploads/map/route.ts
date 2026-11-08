import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { events, uploads, venues } from '@/db/schema';
import { currentUser } from '@/server/auth/rbac';
import { resolveEventScope } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';

const MAX_BYTES = 8 * 1024 * 1024;
/** Wider than any screen will show it; keeps the stored row and the download small. */
const MAX_WIDTH = 2400;
/** A stored image should stay well under any host's request limit. */
const TARGET_BYTES = 900 * 1024;
const STEPS: Array<[width: number, quality: number]> = [
  [2400, 82],
  [1800, 75],
  [1400, 65],
  [1200, 55],
];
const ALLOWED = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/svg+xml', '.svg'],
]);

/**
 * The declared content type is the browser's word for it. Check the bytes too,
 * so a renamed executable cannot be stored and served back as an image.
 */
function looksLikeImage(bytes: Buffer, declared: string): boolean {
  if (bytes.length < 12) return false;
  const hex = bytes.subarray(0, 12).toString('hex');

  switch (declared) {
    case 'image/png':
      return hex.startsWith('89504e470d0a1a0a');
    case 'image/jpeg':
      return hex.startsWith('ffd8ff');
    case 'image/webp':
      return hex.startsWith('52494646') && hex.slice(16, 24) === '57454250';
    case 'image/svg+xml': {
      const head = bytes.subarray(0, 1024).toString('utf8').trimStart();
      return head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!--');
    }
    default:
      return false;
  }
}

/**
 * Downscales a large photo or screenshot to something a map viewer can use.
 * An 8 MB phone photo becomes a few hundred kilobytes, which matters twice: it
 * is one database row, and it is what a phone downloads on stadium wifi.
 *
 * SVG is left alone — it is already small and rasterizing it would lose the
 * one advantage it has. If the resize fails for any reason the original is
 * stored unchanged; a working upload beats a clever one.
 */
async function normalize(
  bytes: Buffer,
  declared: string,
  extension: string,
): Promise<{ bytes: Buffer; contentType: string; extension: string }> {
  if (declared === 'image/svg+xml') {
    return { bytes, contentType: declared, extension };
  }
  try {
    const { default: sharp } = await import('sharp');
    const meta = await sharp(bytes, { failOn: 'none' }).metadata();
    if (!meta.width || !meta.height) throw new Error('no dimensions');
    if (meta.width <= MAX_WIDTH && bytes.length <= TARGET_BYTES) {
      return { bytes, contentType: declared, extension };
    }

    // Step down until the stored row is comfortably small. Detailed maps
    // compress well; a photographed one may need the second or third step.
    let out: Buffer | null = null;
    for (const [width, quality] of STEPS) {
      out = await sharp(bytes, { failOn: 'none' })
        .rotate()
        .resize({ width: Math.min(meta.width, width), withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();
      if (out.length <= TARGET_BYTES) break;
    }
    if (!out) throw new Error('resize produced nothing');
    return { bytes: out, contentType: 'image/webp', extension: '.webp' };
  } catch {
    return { bytes, contentType: declared, extension };
  }
}

/**
 * Venue / event map upload. Authorization is checked here on the server — a
 * hidden field in the browser is never the boundary (spec §30).
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 401 });

  const form = await request.formData();
  const file = form.get('file');
  const venueId = form.get('venueId');
  const eventId = form.get('eventId');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'NO_FILE' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'TOO_LARGE' }, { status: 413 });
  }
  const isPdf = file.type === 'application/pdf';
  const extension = isPdf ? '.pdf' : ALLOWED.get(file.type);
  if (!extension || (isPdf && !(typeof eventId === 'string' && eventId))) {
    return NextResponse.json({ error: 'BAD_TYPE' }, { status: 415 });
  }

  if (typeof venueId === 'string' && venueId) {
    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }
  } else if (typeof eventId === 'string' && eventId) {
    const scope = await resolveEventScope(eventId, user);
    if (!scope?.canManage) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: 'NO_TARGET' }, { status: 400 });
  }

  const original = Buffer.from(await file.arrayBuffer());
  const looksLikePdf = isPdf && original.subarray(0, 5).toString('ascii') === '%PDF-';
  if ((isPdf && !looksLikePdf) || (!isPdf && !looksLikeImage(original, file.type))) {
    return NextResponse.json({ error: 'BAD_TYPE' }, { status: 415 });
  }

  const { bytes, contentType, extension: ext } = isPdf
    ? { bytes: original, contentType: 'application/pdf', extension }
    : await normalize(original, file.type, extension);

  const name = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
  // Stored in the database, not on disk: Next.js indexes public/ once at boot
  // (a file written there at runtime 404s until a restart) and a serverless
  // host has no writable disk at all. Served by src/app/uploads/[name]/route.ts.
  await db.insert(uploads).values({
    name,
    contentType,
    size: bytes.length,
    data: bytes,
    uploadedById: user.id,
  });
  const url = `/uploads/${name}`;

  if (typeof venueId === 'string' && venueId) {
    const venue = await db.query.venues.findFirst({ where: eq(venues.id, venueId) });
    if (!venue) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    await db
      .update(venues)
      .set({ mapImageUrl: url, updatedAt: new Date() })
      .where(eq(venues.id, venueId));
    await recordAudit({
      actorId: user.id,
      actorName: user.name,
      action: 'UPDATE',
      entity: 'VENUE',
      entityId: venueId,
      entityLabel: venue.name,
      oldValues: { mapImageUrl: venue.mapImageUrl },
      newValues: { mapImageUrl: url },
      summary: `تم رفع خريطة الموقع: ${venue.name}`,
    });
  } else if (typeof eventId === 'string' && eventId) {
    const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
    if (!event) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    await db
      .update(events)
      .set({
        mapImageUrl: isPdf ? null : url,
        mapDocumentUrl: isPdf ? url : null,
        mapLinkUrl: null,
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId));
    await recordAudit({
      eventId,
      actorId: user.id,
      actorName: user.name,
      action: 'UPDATE',
      entity: 'EVENT',
      entityId: eventId,
      entityLabel: event.name,
      oldValues: {
        mapImageUrl: event.mapImageUrl,
        mapDocumentUrl: event.mapDocumentUrl,
        mapLinkUrl: event.mapLinkUrl,
      },
      newValues: isPdf ? { mapDocumentUrl: url } : { mapImageUrl: url },
      summary: `تم رفع خريطة خاصة بالفعالية (${isPdf ? 'PDF' : 'صورة'}): ${event.name}`,
    });
  }

  return NextResponse.json({ url });
}
