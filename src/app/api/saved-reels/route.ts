import { NextRequest, NextResponse } from 'next/server';
import { requireMediaUser } from '@/lib/media-api-access';
import { projectFromCompletedExport } from '@/lib/saved-reels/export-project';
import {
  deleteSavedReel,
  getSavedReel,
  listSavedReelsPage,
  ReelConflictError,
  saveSavedReel,
  savedReelsCloudEnabled,
} from '@/lib/saved-reels/storage';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };

function failure(error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Saved Reels unavailable';
  const status =
    error instanceof SyntaxError
      ? 400
      : error instanceof ReelConflictError
        ? 409
        : message.includes('not found')
          ? 404
          : /Invalid|exceeds|Upload|Re-upload|temporary|stored file|unavailable to this account/.test(
                message
              )
            ? 400
            : 503;
  return NextResponse.json(
    { success: false, error: message },
    { status, headers }
  );
}

export async function GET(req: NextRequest) {
  const access = await requireMediaUser(req);
  if (access.error) return access.error;
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      const reel = await getSavedReel(access.user.id, id);
      if (!reel)
        return NextResponse.json(
          { error: 'Saved reel not found' },
          { status: 404, headers }
        );
      return NextResponse.json(
        { success: true, reel, durable: savedReelsCloudEnabled() },
        { headers }
      );
    }
    const page = Math.min(100000, Math.max(0, Number(req.nextUrl.searchParams.get('page')) || 0));
    const result = await listSavedReelsPage(access.user.id, { page: Math.floor(page), query: (req.nextUrl.searchParams.get('q') || '').slice(0, 300), sort: req.nextUrl.searchParams.get('sort') || 'updated', filter: req.nextUrl.searchParams.get('filter') || 'all' });
    return NextResponse.json(
      { success: true, ...result, durable: savedReelsCloudEnabled() },
      { headers }
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req: NextRequest) {
  const access = await requireMediaUser(req);
  if (access.error) return access.error;
  try {
    const text = await req.text();
    if (Buffer.byteLength(text) > 1_600_000)
      return NextResponse.json(
        { error: 'Metadata exceeds 1.5 MB' },
        { status: 413 }
      );
    const body = JSON.parse(text);
    const project =
      body.project ||
      (typeof body.exportUrl === 'string'
        ? await projectFromCompletedExport(
            access.user.id,
            body.exportUrl,
            String(body.title || 'Saved export'),
            req.nextUrl.origin
          )
        : null);
    const reel = await saveSavedReel(
      access.user.id,
      project,
      req.nextUrl.origin,
      {
        id: body.id,
        revision: body.revision,
        originProjectId: body.originProjectId,
        originProjectName: body.originProjectName,
      }
    );
    return NextResponse.json(
      { success: true, reel, durable: savedReelsCloudEnabled() },
      { headers }
    );
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(req: NextRequest) {
  const access = await requireMediaUser(req);
  if (access.error) return access.error;
  try {
    await deleteSavedReel(
      access.user.id,
      req.nextUrl.searchParams.get('id') || '',
      Number(req.nextUrl.searchParams.get('revision'))
    );
    return NextResponse.json({ success: true }, { headers });
  } catch (error) {
    return failure(error);
  }
}
