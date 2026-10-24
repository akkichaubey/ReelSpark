import { NextRequest, NextResponse } from 'next/server';
import { probeVideo } from '@/lib/ffmpeg';
import { ProbeRequestSchema } from '@/lib/clipping-studio/contracts';
import fs from 'fs';
import { requireMediaUser } from '@/lib/media-api-access';
import { canReadMedia } from '@/lib/media-access';
import { restorePrivateMedia } from '@/lib/cloudflare/private-media';

export async function POST(req: NextRequest) {
  try {
    const access = await requireMediaUser(req);
    if (access.error) return access.error;
    const body = await req.json();
    const parsed = ProbeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid probe request' },
        { status: 400 }
      );
    }

    const { filePath } = parsed.data;
    if (!(await canReadMedia(access.user.id, filePath))) await restorePrivateMedia(access.user.id, filePath);
    if (!(await canReadMedia(access.user.id, filePath))) {
      return NextResponse.json({ success: false, error: 'Media not found' }, { status: 404 });
    }
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: `Media file does not exist: ${filePath}` },
        { status: 404 }
      );
    }

    const meta = await probeVideo(filePath);
    return NextResponse.json({
      success: true,
      metadata: {
        durationSeconds: meta.duration,
        durationMs: Math.round(meta.duration * 1000),
        sizeBytes: meta.sizeBytes,
        formatName: meta.format,
        width: meta.width,
        height: meta.height,
        fps: meta.fps,
        aspectRatio: meta.aspectRatio,
        hasVideo: meta.aspectRatio !== 'Audio',
        hasAudio: meta.hasAudio,
        videoCodec: meta.videoCodec,
        audioCodec: meta.audioCodec,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to probe media' },
      { status: 500 }
    );
  }
}
