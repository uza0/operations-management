import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { uploads } from '@/db/schema';

/**
 * Serves uploaded map images.
 *
 * Why not the `public/` folder: Next.js takes its inventory of that folder
 * when the production server boots, so a file written there at runtime is
 * invisible until the next restart — the upload appeared to work, the database
 * held the URL, and the image 404'd. A serverless host has no writable disk at
 * all. So images are rows, read on every request.
 *
 * `data/uploads/` and `public/uploads/` are still checked afterwards, so
 * anything written by an earlier version keeps working.
 */

const TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
]);

/** Upload names are generated as `<timestamp>-<hex><ext>`; nothing else is served. */
const SAFE_NAME = /^[a-zA-Z0-9._-]+$/;

const HEADERS = {
  // Names carry a timestamp and a random suffix, so a file never changes under
  // its own URL.
  'cache-control': 'public, max-age=31536000, immutable',
  // An uploaded SVG is inert under this, even if opened directly.
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
  'x-content-type-options': 'nosniff',
};

/**
 * A local SQLite file hands back a Buffer; the same column over Turso's HTTP
 * protocol arrives as a Uint8Array or an ArrayBuffer. Normalize rather than
 * assume — the difference only shows up in production otherwise.
 */
function toBytes(value: unknown): Uint8Array<ArrayBuffer> {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    const view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const copy = new Uint8Array(new ArrayBuffer(view.byteLength));
    copy.set(view);
    return copy;
  }
  if (typeof value === 'string') {
    const buf = Buffer.from(value, 'base64');
    const copy = new Uint8Array(new ArrayBuffer(buf.byteLength));
    copy.set(buf);
    return copy;
  }
  return new Uint8Array(new ArrayBuffer(0));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;

  // No traversal, no hidden files, no surprises — the name is the whole path.
  if (!SAFE_NAME.test(name) || name.startsWith('.') || name.includes('..')) {
    return new NextResponse('Not found', { status: 404 });
  }

  const row = await db.query.uploads.findFirst({ where: eq(uploads.name, name) });
  if (row) {
    const headers: Record<string, string> = {
      ...HEADERS,
      'content-type': row.contentType,
    };
    if (row.contentType === 'application/pdf') headers['content-disposition'] = 'inline';
    return new NextResponse(toBytes(row.data), {
      headers,
    });
  }

  const contentType = TYPES.get(path.extname(name).toLowerCase());
  if (!contentType) return new NextResponse('Not found', { status: 404 });

  for (const root of [
    path.join(process.cwd(), 'data', 'uploads'),
    path.join(process.cwd(), 'public', 'uploads'),
  ]) {
    const file = path.join(root, name);
    if (path.dirname(file) !== root) continue;
    try {
      const bytes = await fs.readFile(file);
      return new NextResponse(new Uint8Array(bytes), {
        headers: { ...HEADERS, 'content-type': contentType },
      });
    } catch {
      // try the next root
    }
  }

  return new NextResponse('Not found', { status: 404 });
}
