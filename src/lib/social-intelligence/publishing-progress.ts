import { SocialPublishingJob, PublishingPlatformKey } from './publishing-types';

export function publishingProgress(job: SocialPublishingJob, platform: string) {
  const records = platform === 'all' ? job.platforms : job.platforms.filter(r => r.platform === platform);
  const terminal = records.length > 0 && records.every(r => r.status === 'published' || r.status === 'failed');
  if (terminal) {
    const failed = records.filter(r => r.status === 'failed');
    return { done: true, status: failed.length ? 'failed' as const : 'published' as const,
      message: failed.length ? `${failed.length} platform(s) failed. ${failed[0].errorMessage || 'Review publishing history.'}` : 'Publishing completed successfully.',
      postUrl: records.length === 1 ? records[0].platformPostUrl : undefined };
  }
  const percent = records.length ? Math.round(records.reduce((sum,r) => sum + r.progressPercent,0) / records.length) : 0;
  return { done: false, status: 'uploading' as const, message: `Publishing (${percent}%)...`, postUrl: undefined };
}
