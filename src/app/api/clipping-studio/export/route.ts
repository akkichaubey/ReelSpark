import { NextRequest, NextResponse } from 'next/server';
import { executeExportProcess } from '@/lib/clipping-studio/export-engine';
import { fallbackJobs, daemonJobOwners, type FallbackExportJob } from '@/lib/clipping-studio/export-job-registry';
import { requireMediaUser } from '@/lib/media-api-access';
import { createServerExportPlan, ExportPlanError } from '@/lib/clipping-studio/server-export-plan';
import { backupPrivateMedia } from '@/lib/cloudflare/private-media';
import path from 'node:path';
import { cancelActiveExportJob } from '@/lib/clipping-studio/export-engine';
import { registerStorageTask } from '@/lib/storage-runtime';

const MEDIA_SERVICE_URL = process.env.MEDIA_SERVICE_URL || 'http://127.0.0.1:4000';

export async function GET(req: NextRequest) {
  const access = await requireMediaUser(req);
  if (access.error) return access.error;
  try {
    const res = await fetch(`${MEDIA_SERVICE_URL}/api/jobs`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      const jobs = new Map((data.jobs || []).filter((job: FallbackExportJob) => daemonJobOwners.get(job.id) === access.user.id).map((job: FallbackExportJob) => [job.id, job]));
      for (const job of fallbackJobs.values()) if (job.ownerUserId === access.user.id) jobs.set(job.id, job);
      return NextResponse.json({ ...data, jobs: Array.from(jobs.values()) });
    }
  } catch (err) {
    // Media service offline, fallback to in-memory list
  }

  return NextResponse.json({
    success: true,
    jobs: Array.from(fallbackJobs.values()).filter(job => job.ownerUserId === access.user.id),
    source: 'nextjs_in_process_fallback',
  });
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireMediaUser(req);
    if (access.error) return access.error;
    const body = await req.json();
    const {
      jobId,
      projectId,
      jobType,
      targetId,
      args,
      outputPath,
      totalDurationMs,
      sourceMappings,
      outputSettings,
    } = await createServerExportPlan(access.user.id, body);

    if (!jobId || !projectId || !outputPath || !Array.isArray(args)) {
      return NextResponse.json(
        { success: false, error: 'jobId, projectId, outputPath, and args array are required' },
        { status: 400 }
      );
    }

    // Reserve accepted IDs in the in-process registry; do not reuse existing jobs.
    if (fallbackJobs.has(jobId) || daemonJobOwners.has(jobId)) {
      return NextResponse.json({ success: false, error: 'Job ID already exists' }, { status: 409 });
    }
    // Execute only this validated server plan, not raw commands on a local daemon.

    // 2. Next.js in-process fallback execution
    const fallbackJob: FallbackExportJob = {
      ownerUserId: access.user.id,
      id: jobId,
      projectId,
      jobType: jobType || 'single_clip',
      targetId: targetId || jobId,
      status: 'running',
      progressPercent: 0,
      outputPath,
      args,
      totalDurationMs: totalDurationMs || 0,
      sourceMappings: sourceMappings || [],
      outputSettings: outputSettings || {},
      logs: [],
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    };

    fallbackJobs.set(jobId, fallbackJob);
    const finishStorageTask = registerStorageTask({
      id: `export:${jobId}`,
      ownerId: access.user.id,
      kind: 'export',
      paths: [path.dirname(outputPath), path.resolve(path.dirname(outputPath), '..', '..')],
      cancel: () => { cancelActiveExportJob(jobId); },
    });

    // Asynchronously kick off export process without blocking response
    executeExportProcess(
      jobId,
      args,
      totalDurationMs || 0,
      outputPath,
      (percent) => {
        if (fallbackJob.status === 'running') fallbackJob.progressPercent = percent;
      },
      (log) => {
        fallbackJob.logs.push(log);
        if (fallbackJob.logs.length > 200) fallbackJob.logs.shift();
      }
    ).then(async (result) => {
      if (fallbackJob.status === 'cancelled') return;
      if (result.success) {
        await backupPrivateMedia(access.user.id, outputPath);
        fallbackJob.status = 'completed';
        fallbackJob.progressPercent = 100;
        fallbackJob.fileSizeBytes = result.fileSizeBytes;
        fallbackJob.completedAt = new Date().toISOString();
      } else {
        fallbackJob.status = result.error?.includes('cancelled') ? 'cancelled' : 'failed';
        fallbackJob.errorMessage = result.error;
        fallbackJob.completedAt = new Date().toISOString();
      }
    }).catch((error: unknown) => {
      if (fallbackJob.status === 'cancelled') return;
      fallbackJob.status = 'failed';
      fallbackJob.errorMessage = error instanceof Error ? error.message : 'Export execution failed';
      fallbackJob.completedAt = new Date().toISOString();
    }).finally(finishStorageTask);

    return NextResponse.json({ success: true, job: fallbackJob, source: 'nextjs_in_process' }, { status: 202 });
  } catch (err: any) {
    if (err instanceof ExportPlanError) return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    if (err instanceof SyntaxError) return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to submit export job' },
      { status: 500 }
    );
  }
}
