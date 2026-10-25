import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, isSameOriginAuthRequest } from '@/lib/auth';
import { canReadMedia } from '@/lib/media-access';
import { resolveStoragePath } from '@/lib/storage';
import {
  getReelMakerDocument,
  listReelMakerDocuments,
  projectCloudEnabled,
  saveReelMakerDocument,
  validateReelMakerProject,
} from '@/lib/cloudflare/project-documents';
import { hasPrivateMediaBackup, restorePrivateMedia } from '@/lib/cloudflare/private-media';

function collectUrls(input: unknown): string[] {
  const urls = new Set<string>();
  const visit = (value: unknown, key = '') => {
    if (typeof value === 'string') {
      if (/(?:fileUrl|thumbnailUrl|renderedVideoUrl|customBgUrl)$/i.test(key)) urls.add(value);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) value.forEach(item => visit(item, key));
    else Object.entries(value as Record<string, unknown>).forEach(([childKey, child]) => visit(child, childKey));
  };
  visit(input);
  return [...urls];
}

function resolveOwnedApiFilePath(value: string, origin: string): string | null {
  const url = new URL(value, origin);
  if (!url.pathname.startsWith('/api/files/')) return null;
  if (url.origin !== origin) throw new Error('Project media belongs to another host. Re-upload it before cloud saving.');
  const relativePath = decodeURIComponent(url.pathname.slice('/api/files/'.length));
  return resolveStoragePath(relativePath);
}

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  if (!projectCloudEnabled()) {
    return NextResponse.json({ success: true, enabled: false, projects: [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  try {
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      const project = await getReelMakerDocument(user.id, id);
      if (!project) return NextResponse.json({ success: false, error: 'Saved Reel Maker project not found' }, { status: 404 });
      return NextResponse.json({ success: true, enabled: true, project }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const projects = await listReelMakerDocuments(user.id);
    return NextResponse.json({ success: true, enabled: true, projects }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[Reel Maker cloud load] Failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Cloud-saved Reel Maker projects are unavailable' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  if (!isSameOriginAuthRequest(req)) return NextResponse.json({ success: false, error: 'Invalid request origin' }, { status: 403 });
  if (!projectCloudEnabled()) {
    return NextResponse.json({ success: false, synced: false, error: 'Cloud project storage is not enabled; this project is only saved on this device.' }, { status: 503 });
  }

  try {
    const body = await req.text();
    if (Buffer.byteLength(body, 'utf8') > 1_500_000) {
      return NextResponse.json({ success: false, error: 'Project metadata exceeds 1.5 MB' }, { status: 413 });
    }
    let input: unknown;
    try { input = JSON.parse(body); }
    catch { return NextResponse.json({ success: false, error: 'Invalid project JSON' }, { status: 400 }); }

    const project = validateReelMakerProject(user.id, input);
    for (const value of collectUrls(project)) {
      const filePath = resolveOwnedApiFilePath(value, req.nextUrl.origin);
      if (!filePath) continue;
      if (!(await canReadMedia(user.id, filePath))) {
        if (!(await restorePrivateMedia(user.id, filePath)) || !(await canReadMedia(user.id, filePath))) {
          return NextResponse.json({ success: false, error: 'A project media file is not available to this account. Re-upload it before cloud saving.' }, { status: 403 });
        }
      }
      if (!(await hasPrivateMediaBackup(user.id, filePath))) {
        return NextResponse.json({ success: false, error: 'A project media file is not backed up to cloud storage, so it cannot be opened on another device yet.' }, { status: 409 });
      }
    }

    const saved = await saveReelMakerDocument(user.id, project);
    return NextResponse.json({ success: true, synced: true, projectId: saved.id, updatedAt: saved.updatedAt }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[Reel Maker cloud save] Failed:', error instanceof Error ? error.message : error);
    const message = error instanceof Error ? error.message : 'Cloud project save failed';
    const status = message.includes('1.5 MB') ? 413 : 503;
    return NextResponse.json({ success: false, synced: false, error: message }, { status });
  }
}
