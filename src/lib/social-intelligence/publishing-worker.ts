import { getRunnablePublishingJobs, markInterruptedPublishingRecords } from './storage';
import { runtimeOrigin } from '../runtime-origin';

let running = false;
let timer: ReturnType<typeof setInterval> | undefined;

/** Node server worker. Pending records survive restarts in D1 (or a persistent local disk). */
export async function drainPublishingQueue() {
  if (running) return;
  running = true;
  try {
    await markInterruptedPublishingRecords();
    const { executePublishingJobAsync } = await import('./publisher-dispatcher');
    for (const job of await getRunnablePublishingJobs()) {
      const origin = runtimeOrigin(job.publishOrigin);
      await executePublishingJobAsync(job, origin, {
        videoPath: job.videoPath, selectedPlatforms: job.platforms.filter(p => p.status === 'pending').map(p => p.platform),
        defaultCaption: '', platformOverrides: job.publishOptions,
      });
    }
  } finally { running = false; }
}
export function wakePublishingWorker() {
  void drainPublishingQueue().catch(() => console.error('[Publishing worker] Queue processing failed; pending jobs remain saved.'));
}
export function startPublishingWorker() {
  if (timer) return;
  timer = setInterval(wakePublishingWorker, 30000);
  timer.unref();
  wakePublishingWorker();
}
