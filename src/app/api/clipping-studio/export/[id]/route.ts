import { NextRequest, NextResponse } from 'next/server';
import { cancelActiveExportJob } from '@/lib/clipping-studio/export-engine';
import { fallbackJobs, daemonJobOwners } from '@/lib/clipping-studio/export-job-registry';
import { requireMediaUser } from '@/lib/media-api-access';

const MEDIA_SERVICE_URL = process.env.MEDIA_SERVICE_URL || 'http://127.0.0.1:4000';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireMediaUser(req);
  if (access.error) return access.error;
  const { id } = await context.params;

  const localJob = fallbackJobs.get(id);
  if ((localJob ? localJob.ownerUserId : daemonJobOwners.get(id)) !== access.user.id) {
    return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
  }
  if (localJob) {
    return NextResponse.json({ success: true, job: localJob, source: 'nextjs_in_process' });
  }

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
  const access = await requireMediaUser(req);
  if (access.error) return access.error;
  const { id } = await context.params;
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'cancel';

  const localJob = fallbackJobs.get(id);
  if ((localJob ? localJob.ownerUserId : daemonJobOwners.get(id)) !== access.user.id) {
    return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
  }
  if (localJob) {
    if (action === 'retry') {
      return NextResponse.json({ success: false, error: 'Retry not supported in offline fallback mode' }, { status: 501 });
    }
    if (action !== 'cancel') {
      return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
    if (localJob.status !== 'running' && localJob.status !== 'queued') {
      return NextResponse.json({ success: false, error: 'Job is already finished', job: localJob }, { status: 409 });
    }
    const cancelled = cancelActiveExportJob(id);
    if (cancelled) {
      localJob.status = 'cancelled';
      localJob.completedAt = new Date().toISOString();
    }
    return NextResponse.json({ success: cancelled, jobId: id, action, job: localJob }, { status: cancelled ? 200 : 409 });
  }

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
