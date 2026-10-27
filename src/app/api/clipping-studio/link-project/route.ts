import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requireMediaUser, clippingProjectAccess } from '@/lib/media-api-access';
import { canReadMedia } from '@/lib/media-access';
import { loadProject, saveProject } from '@/lib/storage';
import { ownsProject } from '@/lib/project-access';
import { probeVideo } from '@/lib/ffmpeg';
import { restorePrivateMedia } from '@/lib/cloudflare/private-media';
import { projectCloudEnabled, saveClippingDocument, listClippingDocuments } from '@/lib/cloudflare/project-documents';
import { ClippingProjectSchema } from '@/lib/clipping-studio/contracts';
import { linkAnalysisProject, primaryWorkspaceForSource } from '@/lib/clipping-studio/project-bridge';
import type { Project } from '@/lib/types';

const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/);
const requestSchema = z.object({
  sourceProjectId: identifier.optional(),
  workspace: ClippingProjectSchema.optional(),
  assetId: identifier.optional(),
  importSelected: z.boolean().default(false),
});

/** Link existing records without copying uploads or rewriting either project's editing state. */
export async function POST(req: NextRequest) {
  const access = await requireMediaUser(req);
  if (access.error) return access.error;
  try {
    const text = await req.text();
    if (Buffer.byteLength(text) > 1_500_000) return NextResponse.json({ error: 'Project metadata exceeds 1.5 MB' }, { status: 413 });
    const parsed = requestSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid project link' }, { status: 400 });
    const { sourceProjectId, workspace, assetId, importSelected } = parsed.data;
    let existingWorkspace = workspace;
    let source: Project | null;
    if (sourceProjectId) {
      source = await loadProject(sourceProjectId);
      if (!source || !ownsProject(access.user, source)) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      if (!existingWorkspace && projectCloudEnabled()) {
        // A new browser must reopen the saved timeline rather than replace it with an empty adapter.
        const savedProjects = await listClippingDocuments(access.user.id);
        existingWorkspace = primaryWorkspaceForSource(sourceProjectId, savedProjects);
      }
      const workspaceId = existingWorkspace?.id || `studio_${sourceProjectId}`;
      const savedDirectory = await clippingProjectAccess(access.user.id, workspaceId);
      if (savedDirectory) {
        try {
          const saved = ClippingProjectSchema.parse(JSON.parse(await fs.readFile(path.join(savedDirectory, 'linked-workspace.json'), 'utf8')));
          if (saved.sourceProjectId !== sourceProjectId) return NextResponse.json({ error: 'Workspace link conflict. Your saved project was retained.' }, { status: 409 });
          if (!existingWorkspace || Date.parse(saved.updatedAt) > Date.parse(existingWorkspace.updatedAt)) {
            if (existingWorkspace && importSelected) return NextResponse.json({ error: 'A newer workspace was saved. Refresh the project before importing clips.' }, { status: 409 });
            existingWorkspace = saved;
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return NextResponse.json({ error: 'Saved workspace could not be read. It has not been replaced.' }, { status: 409 });
        }
      }
    } else {
      if (!workspace || !assetId || !(await clippingProjectAccess(access.user.id, workspace.id))) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      const asset = workspace.mediaAssets.find(item => item.id === assetId);
      if (!asset) return NextResponse.json({ error: 'Choose a media asset first' }, { status: 400 });
      if (!(await canReadMedia(access.user.id, asset.localPath))) await restorePrivateMedia(access.user.id, asset.localPath);
      if (!(await canReadMedia(access.user.id, asset.localPath))) return NextResponse.json({ error: 'Original media is unavailable. Restore or relink the file first.' }, { status: 404 });
      const sourceId = `proj_studio_${createHash('sha256').update(`${access.user.id}:${workspace.id}:${asset.id}`).digest('hex').slice(0, 32)}`;
      source = await loadProject(sourceId);
      if (source && !ownsProject(access.user, source)) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      if (!source) {
        const metadata = await probeVideo(asset.localPath);
        const now = new Date().toISOString();
        source = { id: sourceId, ownerUserId: access.user.id, title: workspace.name,
          localVideoPath: asset.localPath, originalFileName: asset.filename,
          sourceType: asset.metadata.hasVideo ? 'upload' : 'audio', videoMetadata: metadata,
          status: 'QUEUED', progress: 0, statusMessage: 'Media linked. Ready for AI analysis.',
          settings: { durationLimit: '60', aspectRatio: 'original', normalizeAudio: true, burnSubtitles: false,
            subtitleStyle: { fontSize: 32, fontColor: '#FFFFFF', outlineColor: '#000000', outlineWidth: 2, verticalPosition: 'bottom', alignment: 'center' } },
          transcript: [], candidates: [], timelineCoverage: { analyzedSeconds: 0, totalSeconds: metadata.duration, coveragePercent: 0, ranges: [] },
          createdAt: now, updatedAt: now };
        await saveProject(source);
      }
    }
    if (existingWorkspace?.sourceProjectId && existingWorkspace.sourceProjectId !== source.id && sourceProjectId) {
      return NextResponse.json({ error: 'This workspace is linked to a different AI project.' }, { status: 409 });
    }
    let linked = linkAnalysisProject(source, existingWorkspace ? { ...existingWorkspace, sourceProjectId: source.id, sourceMediaAssetId: assetId || existingWorkspace.sourceMediaAssetId } : undefined, importSelected);
    if (importSelected) linked.updatedAt = new Date().toISOString();
    const directory = await clippingProjectAccess(access.user.id, linked.id, true);
    if (!directory) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    let warning: string | undefined;
    for (const asset of linked.mediaAssets) {
      if (!(await canReadMedia(access.user.id, asset.localPath))) await restorePrivateMedia(access.user.id, asset.localPath);
      if (!(await canReadMedia(access.user.id, asset.localPath))) {
        if (sourceProjectId && !importSelected && asset.localPath === source.localVideoPath) {
          warning = 'Original media is unavailable. Your analysis is preserved; restore or relink the source before editing or exporting.';
        } else return NextResponse.json({ error: 'Original media is unavailable. Restore or relink the file first.' }, { status: 404 });
      }
    }
    if (projectCloudEnabled()) {
      try { linked = await saveClippingDocument(access.user.id, linked); }
      catch { warning = 'Workspace linked locally. Cloud sync failed; retry Sync to Cloud before using another device.'; }
    }
    // This reference record also protects shared source files when cloud sync is disabled.
    const referenceFile = path.join(directory, 'linked-workspace.json');
    const temporaryFile = `${referenceFile}.${createHash('sha256').update(`${Date.now()}:${Math.random()}`).digest('hex').slice(0, 12)}.tmp`;
    await fs.writeFile(temporaryFile, JSON.stringify(linked), 'utf8');
    await fs.rename(temporaryFile, referenceFile);
    return NextResponse.json({ success: true, project: source, workspace: linked, warning });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to link project' }, { status: 400 });
  }
}
