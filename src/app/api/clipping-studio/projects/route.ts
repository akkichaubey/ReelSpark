import { NextRequest, NextResponse } from 'next/server';
import { requireMediaUser, clippingProjectAccess } from '@/lib/media-api-access';
import { canReadMedia } from '@/lib/media-access';
import { ClippingProjectSchema } from '@/lib/clipping-studio/contracts';
import { listClippingDocuments, projectCloudEnabled, saveClippingDocument } from '@/lib/cloudflare/project-documents';
import { DELETE as deleteProject } from './[id]/route';
import { mediaLifecycleEnabled } from '@/lib/cloudflare/media-lifecycle-state';
import { d1Query } from '@/lib/cloudflare/d1';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { withProjectMutation } from '@/lib/project-mutations';

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
  try {
    const body = await req.text();
    if (Buffer.byteLength(body, 'utf8') > 1_500_000) return NextResponse.json({ success: false, error: 'Project metadata exceeds 1.5 MB' }, { status: 413 });
    const parsed = ClippingProjectSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid project metadata' }, { status: 400 });
    const project = parsed.data;
    return await withProjectMutation(project.sourceProjectId || project.id, async () => {
      const cloudEnabled = projectCloudEnabled();
      if (!cloudEnabled && !project.sourceProjectId) return NextResponse.json({ success: true, synced: false, message: 'Cloud metadata is disabled; project remains local.' });
      const directory = await clippingProjectAccess(access.user.id, project.id, cloudEnabled);
      if (!directory) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      const referenceFile = path.join(directory, 'linked-workspace.json');
      const previous = await fs.readFile(referenceFile, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (previous !== null) {
        const linked = ClippingProjectSchema.parse(JSON.parse(previous));
        if (linked.id !== project.id || linked.sourceProjectId !== project.sourceProjectId) {
          return NextResponse.json({ error: 'Workspace link conflict. Reopen the project and retry Save / Sync.' }, { status: 409 });
        }
      }
      for (const asset of project.mediaAssets) {
        if (!(await canReadMedia(access.user.id, asset.localPath))) return NextResponse.json({ error: 'Project references inaccessible media' }, { status: 404 });
      }
      const saved = cloudEnabled ? await saveClippingDocument(access.user.id, project) : project;
      if (previous !== null) {
        const temporaryFile = `${referenceFile}.${randomUUID()}.tmp`;
        try {
          await fs.writeFile(temporaryFile, JSON.stringify(saved), { encoding: 'utf8', flag: 'wx' });
          await fs.rename(temporaryFile, referenceFile);
        } finally {
          await fs.rm(temporaryFile, { force: true }).catch(() => undefined);
        }
      }
      const message = cloudEnabled ? 'Project metadata saved to D1. Media files are not backed up yet.' : 'Workspace saved locally and shared media references updated.';
      return NextResponse.json({ success: true, synced: cloudEnabled, project: saved, mediaDurable: false, message });
    });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    return NextResponse.json({ success: false, error: 'Workspace sync could not finish. Retry Save / Sync before deleting shared files.' }, { status: 503 });
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
