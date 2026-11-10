import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { requireMediaUser } from '@/lib/media-api-access';
import { canReadMedia } from '@/lib/media-access';
import { hasPrivateMediaBackup, restorePrivateMedia } from '@/lib/cloudflare/private-media';
import { clippingProjectDeleted } from '@/lib/cloudflare/media-lifecycle-state';
import { APP_CONFIG } from '@/lib/config';
import { assertSafePath } from '@/lib/storage';

export const runtime = 'nodejs';
const requestSchema = z.object({ sources: z.array(z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/),
  filePath: z.string().min(1).max(4096),
})).max(30), restore: z.boolean().default(false) });

export async function POST(req: Request) {
  const access = await requireMediaUser(req);
  if (access.error) return access.error;
  const input = requestSchema.safeParse(await req.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Invalid B-roll media request' }, { status: 400 });
  const assets: { id: string; url: string }[] = [];
  for (const source of input.data.sources) {
    req.signal.throwIfAborted();
    try {
      const root = APP_CONFIG.storageRoot;
      const file = assertSafePath(path.resolve(root, source.filePath), root);
      if (!/\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(file)) continue;
      const parts = path.relative(root, file).split(path.sep);
      if (parts[0] === 'clipping-studio' && parts[1] === 'projects' && await clippingProjectDeleted(parts[2])) continue;
      const local = await canReadMedia(access.user.id, file);
      if (local || input.data.restore) {
        if (!local && !(await restorePrivateMedia(access.user.id, file))) continue;
        if (!(await fs.stat(file)).isFile()) continue;
      } else if (!(await hasPrivateMediaBackup(access.user.id, file))) continue;
      const url = '/api/files/' + parts.map(encodeURIComponent).join('/');
      assets.push({ id: source.id, url });
    } catch { /* Treat inaccessible or missing assets as unavailable. */ }
  }
  return NextResponse.json({ assets }, { headers: { 'Cache-Control': 'private, no-store' } });
}
