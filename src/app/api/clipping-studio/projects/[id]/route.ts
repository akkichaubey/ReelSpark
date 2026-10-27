import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from '@/lib/config';
import { assertSafePath, containsPathInsideProject, listProjects } from '@/lib/storage';
import { requireMediaUser, clippingProjectAccess } from '@/lib/media-api-access';
import { mediaLifecycleEnabled } from '@/lib/cloudflare/media-lifecycle-state';
import { deleteOwnedClippingProject } from '@/lib/cloudflare/media-lifecycle';
import { projectCloudEnabled } from '@/lib/cloudflare/project-documents';
import { privateMediaEnabled } from '@/lib/cloudflare/private-media';
import { fallbackJobs } from '@/lib/clipping-studio/export-job-registry';
import { cancelStorageTasksUnder, isStoragePathActive } from '@/lib/storage-runtime';
import { isStoragePathReferencedByAnotherProject, loadStorageReferenceSnapshot } from '@/lib/storage-references';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await requireMediaUser(req);
    if (access.error) return access.error;
    const { id: projectId } = await params;
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(projectId)) return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    const ownedProjectDir = await clippingProjectAccess(access.user.id, projectId);
    if (ownedProjectDir) {
      if ((await listProjects(access.user.id)).some(project => containsPathInsideProject(project, ownedProjectDir))) {
        return NextResponse.json({ error: 'This media is used by a linked AI project. Delete the AI project first to preserve shared media.' }, { status: 409 });
      }
      await cancelStorageTasksUnder(ownedProjectDir);
      if (isStoragePathActive(ownedProjectDir)) {
        return NextResponse.json({ error: 'Project processing is still stopping. Retry deletion in a moment.' }, { status: 409 });
      }
      const references = await loadStorageReferenceSnapshot();
      if (isStoragePathReferencedByAnotherProject(references, 'clipping-studio', projectId, ownedProjectDir)) {
        return NextResponse.json({ error: 'Project media is referenced by another saved project or the media inventory needs refreshing. Refresh the workspace, then retry.' }, { status: 409 });
      }
    }
    if (Array.from(fallbackJobs.values()).some(job => job.projectId === projectId && job.ownerUserId === access.user.id && ['running', 'queued'].includes(job.status))) {
      return NextResponse.json({ error: 'Project processing is still stopping. Retry deletion in a moment.' }, { status: 409 });
    }
    if (mediaLifecycleEnabled()) {
      await deleteOwnedClippingProject(access.user.id, projectId);
      return NextResponse.json({ success: true, cleanupPending: true, message: 'Project deleted; private objects are queued for maintenance cleanup' }, { status: 202 });
    }
    if (projectCloudEnabled() || process.env.CLOUD_PROJECT_METADATA_ENABLED === 'true' || privateMediaEnabled()) {
      return NextResponse.json({ error: 'Cloud deletion requires lifecycle migration/configuration; local project retained' }, { status: 503 });
    }
    if (!(await clippingProjectAccess(access.user.id, projectId))) {
      const target = assertSafePath(path.join(APP_CONFIG.storageRoot, 'clipping-studio', 'projects', projectId));
      if (!fs.existsSync(target)) return NextResponse.json({ success: true, localOnly: true });
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ success: false, error: 'Invalid project ID' }, { status: 400 });
    }

    const projectsBaseDir = path.join(APP_CONFIG.storageRoot, 'clipping-studio', 'projects');
    const projectDir = path.join(projectsBaseDir, projectId);

    // Assert safe path to prevent directory traversal
    assertSafePath(projectDir, projectsBaseDir);

    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }

    return NextResponse.json({
      success: true,
      message: `Project ${projectId} deleted successfully from storage`,
    });
  } catch (err: any) {
    if (err.message === 'Project not found') return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    if (err.message === 'Project media is referenced by another saved project') return NextResponse.json({ error: err.message }, { status: 409 });
    console.error('[Clipping Studio API] Error deleting project storage:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to delete project storage' },
      { status: 500 }
    );
  }
}
