import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { teamMembers, uploads } from '@/db/schema';
import { currentUser } from '@/server/auth/rbac';
import { currentMember } from '@/server/services/member-auth';
import { recordAudit } from '@/server/services/audit';

const MAX_INPUT = 3 * 1024 * 1024;
const MAX_OUTPUT = 48 * 1024;

export async function POST(request: Request) {
  const [staff, member] = await Promise.all([currentUser(), currentMember()]);
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'NO_FILE' }, { status: 400 });
  if (file.size > MAX_INPUT) return NextResponse.json({ error: 'TOO_LARGE' }, { status: 413 });
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return NextResponse.json({ error: 'BAD_TYPE' }, { status: 415 });

  const rawTarget = form.get('memberId');
  const adminUpload = staff?.role === 'ADMIN' && typeof rawTarget === 'string' && rawTarget.length > 0;
  const targetId = adminUpload
    ? rawTarget
    : member?.teamMemberId;
  if (!targetId || (!member && staff?.role !== 'ADMIN')) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const original = Buffer.from(await file.arrayBuffer());
  let image: Buffer;
  try {
    const { default: sharp } = await import('sharp');
    let quality = 72;
    image = await sharp(original, { failOn: 'error' }).rotate().resize(128, 128, { fit: 'cover', position: 'attention' }).webp({ quality }).toBuffer();
    while (image.length > MAX_OUTPUT && quality > 42) {
      quality -= 10;
      image = await sharp(original, { failOn: 'error' }).rotate().resize(128, 128, { fit: 'cover', position: 'attention' }).webp({ quality }).toBuffer();
    }
    if (image.length > MAX_OUTPUT) throw new Error('Image is too large after compression');
  } catch {
    return NextResponse.json({ error: 'BAD_IMAGE' }, { status: 415 });
  }

  const person = await db.query.teamMembers.findFirst({ where: eq(teamMembers.id, targetId), columns: { id: true, fullName: true, photoUrl: true, pendingPhotoUrl: true } });
  if (!person) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  const name = `profile-${randomBytes(16).toString('hex')}.webp`;
  const url = `/uploads/${name}`;
  await db.insert(uploads).values({ name, contentType: 'image/webp', size: image.length, data: image, uploadedById: staff?.id ?? null });
  await db.update(teamMembers).set({
    ...(adminUpload ? { photoUrl: url, pendingPhotoUrl: null } : { pendingPhotoUrl: url }),
    updatedAt: new Date(),
  }).where(eq(teamMembers.id, targetId));
  const replacedUrl = adminUpload ? person.photoUrl : person.pendingPhotoUrl;
  const replacedName = replacedUrl?.startsWith('/uploads/profile-') ? replacedUrl.split('/').pop() : null;
  if (replacedName) await db.delete(uploads).where(eq(uploads.name, replacedName));
  if (adminUpload && staff) await recordAudit({ actorId: staff.id, actorName: staff.name, action: 'UPDATE', entity: 'TEAM_MEMBER', entityId: person.id, entityLabel: person.fullName, newValues: { photoUrl: url }, summary: `تم تحديث الصورة الشخصية: ${person.fullName}` });
  return NextResponse.json({ ok: true, pending: !adminUpload, url });
}
