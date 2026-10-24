import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { fallbackJobs, type FallbackExportJob } from '../src/lib/clipping-studio/export-job-registry';
import { GET as listJobs } from '../src/app/api/clipping-studio/export/route';
import { GET as readJob, POST as actionJob } from '../src/app/api/clipping-studio/export/[id]/route';
import type { RunningProcessHandle } from '../src/lib/clipping-studio/export-engine';

async function main() {
  const originalFetch = globalThis.fetch;
  const originalDemo = process.env.ALLOW_DEMO_LOGIN;
  process.env.ALLOW_DEMO_LOGIN = 'true';
  const id = 'regression-fallback-job';
  const context = { params: Promise.resolve({ id }) };
  const job: FallbackExportJob = {
    ownerUserId: 'usr_admin',
    id, projectId: 'test', jobType: 'single_clip', targetId: 'clip',
    status: 'running', progressPercent: 42, outputPath: 'unused.mp4',
    args: [], totalDurationMs: 1000, sourceMappings: [], outputSettings: {},
    logs: [], createdAt: new Date().toISOString(),
  };
  const registry = globalThis as typeof globalThis & {
    reelsparkExportProcesses: Map<string, RunningProcessHandle>;
  };
  let cancelled = false;
  try {
    globalThis.fetch = async () => { throw new Error('Standalone offline'); };
    fallbackJobs.set(id, job);
    registry.reelsparkExportProcesses.set(id, {
      process: {} as RunningProcessHandle['process'], cancel: () => { cancelled = true; },
    });
    const request = new NextRequest(`http://localhost/api/clipping-studio/export/${id}`);
    assert.equal((await (await readJob(request, context)).json()).job.progressPercent, 42);
    assert.ok((await (await listJobs(request)).json()).jobs.some((item: FallbackExportJob) => item.id === id));
    // A recovered daemon must not hide jobs started in the Next process.
    globalThis.fetch = async () => Response.json({ success: true, jobs: [{ id: 'daemon-job' }] });
    assert.equal((await (await listJobs(request)).json()).jobs.length, 1, 'Unowned daemon jobs must be hidden');
    job.ownerUserId = 'another-user';
    assert.equal((await readJob(request, context)).status, 404);
    assert.equal((await actionJob(request, context)).status, 404);
    assert.equal((await (await listJobs(request)).json()).jobs.length, 0);
    job.ownerUserId = 'usr_admin';
    const retry = new NextRequest(`${request.url}?action=retry`, { method: 'POST' });
    assert.equal((await actionJob(retry, context)).status, 501);
    assert.equal(job.status, 'running');
    assert.equal((await actionJob(request, context)).status, 200);
    assert.equal(cancelled, true);
    assert.equal(job.status, 'cancelled');
    assert.equal((await actionJob(request, context)).status, 409);
    globalThis.fetch = async () => { throw new Error('Offline'); };
    assert.equal((await readJob(request, { params: Promise.resolve({ id: 'missing' }) })).status, 404);
    console.log('PASS: offline status/list, daemon recovery merge, cancel, terminal conflict, unsupported retry and missing job');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDemo === undefined) delete process.env.ALLOW_DEMO_LOGIN;
    else process.env.ALLOW_DEMO_LOGIN = originalDemo;
    fallbackJobs.delete(id);
    registry.reelsparkExportProcesses.delete(id);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
