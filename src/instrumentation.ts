export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { publishingRuntimeStatus } = await import('./lib/social-intelligence/publishing-runtime');
    const status = publishingRuntimeStatus();
    if (status.issues.length) console.warn('[Publishing setup]', status.issues.join(' '));
    const { startPublishingWorker } = await import('./lib/social-intelligence/publishing-worker');
    startPublishingWorker();
    const { startStorageMaintenanceScheduler } = await import('./lib/storage-maintenance');
    startStorageMaintenanceScheduler();
  }
}
