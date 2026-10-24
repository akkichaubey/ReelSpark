import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { APP_CONFIG } from './config';
import { assertSafePath } from './storage';
import { clippingProjectDeleted } from './cloudflare/media-lifecycle-state';

const OWNER_FILE = '.owner.json';

export function mediaUserNamespace(userId: string): string {
  return createHash('sha256').update(userId).digest('hex');
}

/** Only shipped sample media/BGM may bypass private-storage ownership. */
export async function canUseRenderMedia(userId: string, filePath: string): Promise<boolean> {
  if (await canReadMedia(userId, filePath)) return true;
  try {
    const publicRoot = await fs.realpath(path.join(process.cwd(), 'public'));
    const realFile = assertSafePath(await fs.realpath(filePath), publicRoot);
    const relative = path.relative(publicRoot, realFile).split(path.sep).join('/');
    return relative === 'sample-image.jpg' || relative === 'sample-audio.mp3' || relative.startsWith('audio/bgm/');
  } catch {
    return false;
  }
}

/** Write once when creating a new, server-generated media directory. */
export async function recordMediaOwner(directory: string, userId: string): Promise<void> {
  assertSafePath(directory, APP_CONFIG.storageRoot);
  await fs.writeFile(path.join(directory, OWNER_FILE), JSON.stringify({ userId }), { flag: 'wx' });
}

/** Unknown/legacy ownership is denied; never infer an owner from a URL. */
export async function canReadMedia(userId: string, filePath: string, root = APP_CONFIG.storageRoot): Promise<boolean> {
  try {
    const safePath = assertSafePath(filePath, root);
    // Resolve symlinks/junctions before checking ownership, not just lexical paths.
    const realRoot = await fs.realpath(root);
    const realFile = assertSafePath(await fs.realpath(safePath), realRoot);
    const parts = path.relative(realRoot, realFile).split(path.sep);
    if (parts.some(part => part.startsWith('.'))) return false;
    if (parts[0] === 'projects' && parts.length >= 3) {
      const manifest = JSON.parse(await fs.readFile(path.join(realRoot, 'projects', parts[1], 'manifest.json'), 'utf8'));
      return manifest.ownerUserId === userId;
    }
    if (parts[0] === 'clipping-studio' && parts[1] === 'projects' && parts.length >= 4) {
      if (await clippingProjectDeleted(parts[2])) return false;
      const owner = JSON.parse(await fs.readFile(path.join(realRoot, 'clipping-studio', 'projects', parts[2], OWNER_FILE), 'utf8'));
      return owner.userId === userId;
    }
    if (parts[0] === 'caption-maker' && ['clips', 'trimmed'].includes(parts[1]) && parts.length >= 4) {
      return parts[2] === mediaUserNamespace(userId);
    }
    if (parts[0] === 'caption-maker' && parts[1] === 'renders' && parts.length >= 5) {
      return parts[2] === mediaUserNamespace(userId);
    }
    // Caption upload ownership applies only to a single asset directory.
    if (parts[0] === 'caption-maker' && /^asset_[a-zA-Z0-9_-]+$/.test(parts[1] || '') && parts.length >= 3) {
      const owner = JSON.parse(await fs.readFile(path.join(realRoot, 'caption-maker', parts[1], OWNER_FILE), 'utf8'));
      return owner.userId === userId;
    }
    return false;
  } catch {
    return false;
  }
}
