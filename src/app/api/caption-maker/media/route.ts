import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getRequestUser, isSameOriginAuthRequest } from '@/lib/auth';
import { APP_CONFIG } from '@/lib/config';
import { assertSafePath, resolveStoragePath } from '@/lib/storage';
import { canReadMedia } from '@/lib/media-access';
import { deletePrivateMedia } from '@/lib/cloudflare/private-media';
import { isStoragePathActive } from '@/lib/storage-runtime';

export async function DELETE(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!isSameOriginAuthRequest(req)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  try {
    const body = await req.json();
    if (typeof body.fileUrl !== 'string' || !body.fileUrl.startsWith('/api/files/') || /[?#]/.test(body.fileUrl))
      return NextResponse.json({ error: 'Only uploaded media can be permanently deleted.' }, { status: 400 });
    const relative = decodeURIComponent(body.fileUrl.slice(11));
    if (relative.split(/[\\/]/).some(part => !part || part.startsWith('.')))
      return NextResponse.json({ error: 'Invalid media path' }, { status: 400 });
    if (!/\.(mp4|mov|webm|mkv|mp3|wav|m4a|aac|ogg|flac|png|jpe?g|webp|gif|avif)$/i.test(relative))
      return NextResponse.json({ error: 'Only media files can be deleted.' }, { status: 400 });
    const filename = resolveStoragePath(relative);
    if (!(await canReadMedia(user.id, filename)))
      return NextResponse.json({ error: 'Media unavailable or not owned by this account.' }, { status: 403 });
    const root = await fs.realpath(APP_CONFIG.storageRoot);
    const realFile = assertSafePath(await fs.realpath(filename), root);
    const parts = path.relative(root, realFile).split(path.sep);
    const directory = path.dirname(realFile);
    // A caption upload owns its original and any extracted audio siblings.
    const upload = parts.length === 3 && parts[0] === 'caption-maker' && /^asset_[a-zA-Z0-9_-]+$/.test(parts[1]) && !parts[1].startsWith('asset_preview_');
    const files = upload
      ? (await fs.readdir(directory, { withFileTypes: true })).filter(entry => entry.isFile() && !entry.name.startsWith('.')).map(entry => path.join(directory, entry.name))
      : [realFile];
    if (files.some(file => isStoragePathActive(file)) || isStoragePathActive(directory))
      return NextResponse.json({ error: 'This media is currently processing. Try again when processing finishes.' }, { status: 409 });
    for (const file of files) {
      if (!(await canReadMedia(user.id, file))) return NextResponse.json({ error: 'Media ownership check failed.' }, { status: 403 });
    }
    // Remove registered backups first so a later request cannot restore deleted bytes.
    for (const file of files) await deletePrivateMedia(user.id, file);
    for (const file of files) await fs.unlink(file);
    return NextResponse.json({ success: true, deletedUrls: files.map(file => '/api/files/' + path.relative(root, file).split(path.sep).join('/')) });
  } catch (error) {
    console.error('[Delete reel media]', error);
    return NextResponse.json({ error: 'Media could not be completely deleted. Please retry.' }, { status: 500 });
  }
}
