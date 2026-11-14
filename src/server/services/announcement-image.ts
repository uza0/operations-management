import 'server-only';

import { randomBytes } from 'node:crypto';
import { and, eq, isNotNull, lte } from 'drizzle-orm';

import { db } from '@/db';
import { announcements, uploads } from '@/db/schema';

/**
 * The picture that can ride along with an announcement.
 *
 * Stored like every other upload, in the database, and kept small on purpose:
 * it is fetched by a hundred-odd phones on a stadium's network and it costs
 * the free plans their storage and their transfer. So whatever arrives — a
 * four-megabyte photo straight off a camera — leaves here as a WebP no wider
 * than 1200 pixels and no heavier than about 300 KB.
 */
const MAX_INPUT = 6 * 1024 * 1024;
const MAX_OUTPUT = 320 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export type ImageOutcome =
  | { ok: true; url: string }
  | { ok: false; reason: 'TOO_LARGE' | 'BAD_TYPE' | 'BAD_IMAGE' };

export async function saveAnnouncementImage(
  file: File,
  uploadedById: string | null,
): Promise<ImageOutcome> {
  if (file.size > MAX_INPUT) return { ok: false, reason: 'TOO_LARGE' };
  if (!TYPES.includes(file.type)) return { ok: false, reason: 'BAD_TYPE' };

  let image: Buffer;
  try {
    const { default: sharp } = await import('sharp');
    const original = Buffer.from(await file.arrayBuffer());
    let width = 1200;
    let quality = 74;
    const render = () =>
      sharp(original, { failOn: 'error' })
        .rotate()
        .resize({ width, height: width * 2, fit: 'inside', withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();
    image = await render();
    // Quality first, then size, until it fits.
    while (image.length > MAX_OUTPUT && (quality > 50 || width > 800)) {
      if (quality > 50) quality -= 8;
      else width -= 200;
      image = await render();
    }
    if (image.length > MAX_OUTPUT) return { ok: false, reason: 'TOO_LARGE' };
  } catch {
    return { ok: false, reason: 'BAD_IMAGE' };
  }

  const name = `ann-${randomBytes(16).toString('hex')}.webp`;
  await db.insert(uploads).values({
    name,
    contentType: 'image/webp',
    size: image.length,
    data: image,
    uploadedById,
  });
  return { ok: true, url: `/uploads/${name}` };
}

/** Removes the stored file behind an announcement picture, if it is one of ours. */
export async function dropAnnouncementImage(url: string | null | undefined) {
  const name = url?.startsWith('/uploads/ann-') ? url.slice('/uploads/'.length) : null;
  if (name) await db.delete(uploads).where(eq(uploads.name, name));
}

/**
 * Clears every picture whose chosen lifetime has run out. The announcement
 * stays as it was written; only the picture, and the space it took, go.
 */
export async function expireAnnouncementImages(now = new Date()): Promise<number> {
  const due = await db
    .select({ id: announcements.id, url: announcements.imageUrl })
    .from(announcements)
    .where(
      and(
        isNotNull(announcements.imageUrl),
        isNotNull(announcements.imageExpiresAt),
        lte(announcements.imageExpiresAt, now),
      ),
    );
  for (const row of due) {
    await dropAnnouncementImage(row.url);
    await db
      .update(announcements)
      .set({ imageUrl: null, imageExpiresAt: null })
      .where(eq(announcements.id, row.id));
  }
  return due.length;
}
