import { NextRequest, NextResponse } from 'next/server';
import { requireMediaUser, clippingProjectAccess } from '@/lib/media-api-access';
import { canReadMedia } from '@/lib/media-access';
import { ClippingProjectSchema } from '@/lib/clipping-studio/contracts';
import { listClippingDocuments, projectCloudEnabled, saveClippingDocument } from '@/lib/cloudflare/project-documents';
import { DELETE as deleteProject } from './[id]/route';
import { mediaLifecycleEnabled } from '@/lib/cloudflare/media-lifecycle-state';
import { d1Query } from '@/lib/cloudflare/d1';

export async function GET(req: NextRequest) {
  const access = await requireMediaUser(req);
  if (access.error) return access.error;
  if (!projectCloudEnabled()) return NextResponse.json({ success: true, enabled: false, projects: [], message: 'Cloud metadata is disabled; local cache remains active.' });
  try {
    const deleted = mediaLifecycleEnabled()
      ? await d1Query<{ project_id: string }>('SELECT project_id FROM deleted_clipping_projects WHERE owner_user_id = ?', [access.user.id])
      : { results: [] };
    return NextResponse.json({ success: true, enabled: true, projects: await listClippingDocuments(access.user.id), deletedProjectIds: deleted.results.map(row => row.project_id), mediaDurable: false }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ success: false, error: 'Cloud metadata unavailable. Verify migration and credentials; local data has not been removed.' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const access = await requireMediaUser(req);
  if (access.error) return access.error;
  if (!projectCloudEnabled()) return NextResponse.json({ success: true, synced: false, message: 'Cloud metadata is disabled; project remains local.' });
  try {
    const body = await req.text();
    if (Buffer.byteLength(body, 'utf8') > 1_500_000) return NextResponse.json({ success: false, error: 'Project metadata exceeds 1.5 MB' }, { status: 413 });
    const parsed = ClippingProjectSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid project metadata' }, { status: 400 });
    const project = parsed.data;
    if (!(await clippingProjectAccess(access.user.id, project.id, true))) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    for (const asset of project.mediaAssets) {
      if (!(await canReadMedia(access.user.id, asset.localPath))) return NextResponse.json({ error: 'Project references inaccessible media' }, { status: 404 });
    }
    const saved = await saveClippingDocument(access.user.id, project);
    return NextResponse.json({ success: true, synced: true, project: saved, mediaDurable: false, message: 'Project metadata saved to D1. Media files are not backed up yet.' });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    return NextResponse.json({ success: false, error: 'Cloud metadata save failed; local data has not been removed.' }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  const access = await requireMediaUser(req);
  if (access.error) return access.error;
  if (!projectCloudEnabled()) return NextResponse.json({ success: false, error: 'Cloud metadata is disabled' }, { status: 503 });
  try {
    const id = req.nextUrl.searchParams.get('id') || '';
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id)) return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    return deleteProject(req, { params: Promise.resolve({ id }) });
  } catch { return NextResponse.json({ success: false, error: 'Cloud metadata deletion failed' }, { status: 503 }); }
}
