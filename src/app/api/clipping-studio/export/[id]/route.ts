import { NextRequest, NextResponse } from 'next/server';
import { cancelActiveExportJob } from '@/lib/clipping-studio/export-engine';

const MEDIA_SERVICE_URL = process.env.MEDIA_SERVICE_URL || 'http://127.0.0.1:4000';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const res = await fetch(`${MEDIA_SERVICE_URL}/api/jobs/${id}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (err) {}

  return NextResponse.json(
    { success: false, error: `Job ${id} not found or media service is unreachable` },
    { status: 404 }
  );
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'cancel';

  if (action === 'cancel') {
    // Try forwarding to media service
    try {
      const res = await fetch(`${MEDIA_SERVICE_URL}/api/jobs/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch (err) {}

    // Fallback: local cancel
    const cancelled = cancelActiveExportJob(id);
    return NextResponse.json({ success: cancelled, jobId: id, action: 'cancel' });
  }

  if (action === 'retry') {
    try {
      const res = await fetch(`${MEDIA_SERVICE_URL}/api/jobs/${id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch (err) {}

    return NextResponse.json(
      { success: false, error: 'Retry not supported in offline fallback mode' },
      { status: 501 }
    );
  }

  return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
}
