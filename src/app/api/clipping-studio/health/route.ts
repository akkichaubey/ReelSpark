import { NextResponse } from 'next/server';
import { checkFfmpegStatus, checkFfprobeStatus } from '@/lib/config';
import { MediaServiceHealthResponse } from '@/lib/clipping-studio/contracts';
import { requireMediaUser } from '@/lib/media-api-access';

const START_TIME = Date.now();

export async function GET(req: Request) {
  try {
    const access = await requireMediaUser(req);
    if (access.error) return access.error;
    const ffmpeg = await checkFfmpegStatus();
    const ffprobe = await checkFfprobeStatus();

    const response: MediaServiceHealthResponse = {
      status: 'ok',
      service: 'reelspark-media-service',
      version: '1.0.0',
      host: '127.0.0.1',
      port: 3000,
      uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
      ffmpeg: {
        available: ffmpeg.available,
        path: ffmpeg.path,
        version: ffmpeg.version,
        error: ffmpeg.error,
      },
      ffprobe: {
        available: ffprobe.available,
        path: ffprobe.path,
        version: ffprobe.version,
        error: ffprobe.error,
      },
    };

    return NextResponse.json(response);
  } catch (err: any) {
    return NextResponse.json(
      { status: 'error', error: err.message || 'Failed to inspect media service health' },
      { status: 500 }
    );
  }
}
