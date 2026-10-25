import { runtimeOrigin } from '@/lib/runtime-origin';
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { mediaUserNamespace } from '@/lib/media-access';
import { APP_CONFIG } from '@/lib/config';
import fs from 'fs';
import path from 'path';
import { VideoAssetForPublishing } from '@/lib/social-intelligence/publishing-types';
import { probePublishingVideo } from '@/lib/social-intelligence/publishing-media';

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userNamespace = mediaUserNamespace(user.id);
    const rendersBase = path.join(APP_CONFIG.storageRoot, 'caption-maker', 'renders', userNamespace);
    const origin = runtimeOrigin(req.url);

    const candidateVideos: VideoAssetForPublishing[] = [];

    // Scan user's render projects
    if (fs.existsSync(rendersBase)) {
      const projectDirs = fs.readdirSync(rendersBase, { withFileTypes: true });
      for (const dir of projectDirs) {
        if (!dir.isDirectory()) continue;
        const projPath = path.join(rendersBase, dir.name);
        const files = fs.readdirSync(projPath);

        const mp4File = files.find((f) => f.endsWith('_final.mp4') || f.endsWith('.mp4'));
        if (!mp4File) continue;

        const fullMp4Path = path.join(projPath, mp4File);
        const stat = fs.statSync(fullMp4Path);

        const coverFile = files.find((f) => f.endsWith('_cover.png') || f.endsWith('.png') || f.endsWith('.jpg'));
        const relMp4 = `caption-maker/renders/${userNamespace}/${dir.name}/${mp4File}`;
        const relCover = coverFile ? `caption-maker/renders/${userNamespace}/${dir.name}/${coverFile}` : undefined;
        let metadata;
        try { metadata = await probePublishingVideo(user.id, relMp4); }
        catch { continue; }

        candidateVideos.push({
          id: dir.name,
          title: dir.name.replace(/^reel_/, 'Reel ').replace(/_/g, ' '),
          storagePath: relMp4,
          webUrl: `/api/files/${relMp4}`,
          durationSeconds: metadata.durationSeconds,
          width: metadata.width,
          height: metadata.height,
          aspectRatio: metadata.aspectRatio,
          fileSizeBytes: stat.size,
          thumbnailUrl: relCover ? `/api/files/${relCover}` : undefined,
          createdAt: stat.mtime.toISOString(),
        });
      }
    }

    // Sort newest first
    candidateVideos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ success: true, videos: candidateVideos });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
