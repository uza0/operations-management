import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { events, uploads } from '@/db/schema';
import { assertEventManager } from '@/server/auth/rbac';
import { recordAudit } from '@/server/services/audit';

/*
 * An event's poster.
 *
 * The file a supervisor has is the one the organiser posted: 1–2 MB, square,
 * 1200px or more. The cards never show it wider than about 400 CSS pixels, so
 * it is cut down once, here, to 640px of WebP — roughly 40–80 KB — and that is
 * all that is ever stored or sent. /uploads/ serves it immutable for a year,
 * so after the first view a phone gets it from the CDN, not from a function.
 */
const MAX_INPUT = 8 * 1024 * 1024;
const MAX_OUTPUT = 140 * 1024;

async function managerOr403(eventId: string) {
  try {
    return await assertEventManager(eventId);
  } catch {
    return null;
  }
}

function dropOld(url: string | null) {
  const name = url?.startsWith('/uploads/poster-') ? url.split('/').pop() : null;
  return name ? db.delete(uploads).where(eq(uploads.name, name)) : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await managerOr403(id);
  if (!user) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  const event = await db.query.events.findFirst({ where: eq(events.id, id), columns: { id: true, name: true, posterUrl: true } });
  if (!event) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'NO_FILE' }, { status: 400 });
  if (file.size > MAX_INPUT) return NextResponse.json({ error: 'TOO_LARGE' }, { status: 413 });
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return NextResponse.json({ error: 'BAD_TYPE' }, { status: 415 });

  const original = Buffer.from(await file.arrayBuffer());
  let image: Buffer;
  try {
    const { default: sharp } = await import('sharp');
    const shrink = (quality: number) =>
      sharp(original, { failOn: 'error' })
        .rotate()
        .resize(640, 800, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();
    let quality = 74;
    image = await shrink(quality);
    while (image.length > MAX_OUTPUT && quality > 44) {
      quality -= 10;
      image = await shrink(quality);
    }
    if (image.length > MAX_OUTPUT) throw new Error('too large');
  } catch {
    return NextResponse.json({ error: 'BAD_IMAGE' }, { status: 415 });
  }

  const name = `poster-${randomBytes(16).toString('hex')}.webp`;
  const url = `/uploads/${name}`;
  await db.insert(uploads).values({ name, contentType: 'image/webp', size: image.length, data: image, uploadedById: user.id });
  await db.update(events).set({ posterUrl: url, updatedAt: new Date() }).where(eq(events.id, id));
  await dropOld(event.posterUrl);
  await recordAudit({ eventId: id, actorId: user.id, actorName: user.name, action: 'UPDATE', entity: 'EVENT', entityId: id, entityLabel: event.name, newValues: { posterUrl: url }, summary: `تم تحديث بوستر الفعالية: ${event.name}` });
  return NextResponse.json({ ok: true, url });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await managerOr403(id);
  if (!user) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  const event = await db.query.events.findFirst({ where: eq(events.id, id), columns: { id: true, name: true, posterUrl: true } });
  if (!event) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  await db.update(events).set({ posterUrl: null, updatedAt: new Date() }).where(eq(events.id, id));
  await dropOld(event.posterUrl);
  await recordAudit({ eventId: id, actorId: user.id, actorName: user.name, action: 'UPDATE', entity: 'EVENT', entityId: id, entityLabel: event.name, oldValues: { posterUrl: event.posterUrl }, summary: `تم حذف بوستر الفعالية: ${event.name}` });
  return NextResponse.json({ ok: true });
}
