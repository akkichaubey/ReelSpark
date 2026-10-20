import { NextRequest, NextResponse } from 'next/server';
import { executeExportProcess, cancelActiveExportJob } from '@/lib/clipping-studio/export-engine';

const MEDIA_SERVICE_URL = process.env.MEDIA_SERVICE_URL || 'http://127.0.0.1:4000';

interface FallbackExportJob {
  id: string;
  projectId: string;
  jobType: string;
  targetId: string;
  status: string;
  progressPercent: number;
  outputPath: string;
  args: string[];
  totalDurationMs: number;
  sourceMappings: any[];
  outputSettings: any;
  logs: string[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  fileSizeBytes?: number;
  errorMessage?: string;
}

// In-process fallback cache if standalone media service is unreachable
const fallbackJobs = new Map<string, FallbackExportJob>();

export async function GET() {
  try {
    const res = await fetch(`${MEDIA_SERVICE_URL}/api/jobs`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (err) {
    // Media service offline, fallback to in-memory list
  }

  return NextResponse.json({
    success: true,
    jobs: Array.from(fallbackJobs.values()),
    source: 'nextjs_in_process_fallback',
  });
}

export async function POST(req: NextRequest) {
  try {
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
    } = body;

    if (!jobId || !projectId || !outputPath || !Array.isArray(args)) {
      return NextResponse.json(
        { success: false, error: 'jobId, projectId, outputPath, and args array are required' },
        { status: 400 }
      );
    }

    // 1. Try forwarding to standalone local media service
    try {
      const forwardRes = await fetch(`${MEDIA_SERVICE_URL}/api/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (forwardRes.ok) {
        const data = await forwardRes.json();
        return NextResponse.json(data, { status: 202 });
      }
    } catch (err) {
      // Standalone media service daemon not answering, continue to local in-process execution
    }

    // 2. Next.js in-process fallback execution
    const fallbackJob: FallbackExportJob = {
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

    // Asynchronously kick off export process without blocking response
    executeExportProcess(
      jobId,
      args,
      totalDurationMs || 0,
      outputPath,
      (percent) => {
        fallbackJob.progressPercent = percent;
      },
      (log) => {
        fallbackJob.logs.push(log);
        if (fallbackJob.logs.length > 200) fallbackJob.logs.shift();
      }
    ).then((result) => {
      if (result.success) {
        fallbackJob.status = 'completed';
        fallbackJob.progressPercent = 100;
        fallbackJob.fileSizeBytes = result.fileSizeBytes;
        fallbackJob.completedAt = new Date().toISOString();
      } else {
        fallbackJob.status = result.error?.includes('cancelled') ? 'cancelled' : 'failed';
        fallbackJob.errorMessage = result.error;
        fallbackJob.completedAt = new Date().toISOString();
      }
    });

    return NextResponse.json({ success: true, job: fallbackJob, source: 'nextjs_in_process' }, { status: 202 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to submit export job' },
      { status: 500 }
    );
  }
}
