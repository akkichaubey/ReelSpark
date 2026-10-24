import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getRequestUser, isSameOriginAuthRequest, type UserProfile } from './auth';
import { APP_CONFIG } from './config';
import { assertSafePath } from './storage';
import { recordMediaOwner } from './media-access';
import { clippingProjectDeleted } from './cloudflare/media-lifecycle-state';

type Access = { user: UserProfile; error?: never } | { user?: never; error: NextResponse };

export async function requireMediaUser(req: Request): Promise<Access> {
  const user = await getRequestUser(req);
  if (!user) return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  if (!['GET', 'HEAD'].includes(req.method) && !isSameOriginAuthRequest(req)) {
    return { error: NextResponse.json({ error: 'Invalid request origin' }, { status: 403 }) };
  }
  return { user };
}

export async function clippingProjectAccess(userId: string, projectId: string, create = false): Promise<string | null> {
  if (typeof projectId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(projectId)) return null;
  if (await clippingProjectDeleted(projectId)) return null;
  const base = path.join(APP_CONFIG.storageRoot, 'clipping-studio', 'projects');
  const directory = assertSafePath(path.join(base, projectId), base);
  if (create) {
    await fs.mkdir(base, { recursive: true });
    try {
      // Only a newly created directory may be claimed. Never claim a legacy project.
      await fs.mkdir(directory);
      await recordMediaOwner(directory, userId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  try {
    const realBase = await fs.realpath(base);
    const realDirectory = assertSafePath(await fs.realpath(directory), realBase);
    if (path.relative(realBase, realDirectory) !== projectId) return null;
    const owner = JSON.parse(await fs.readFile(path.join(realDirectory, '.owner.json'), 'utf8'));
    return owner.userId === userId ? realDirectory : null;
  } catch { return null; }
}
