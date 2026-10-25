/**
 * ReelSpark Multi-Platform Publishing Dispatcher
 *
 * Coordinates concurrent publishing across YouTube Shorts, Instagram Reels,
 * Facebook Reels, and Threads with error isolation and idempotency.
 */

import {
  PublishRequestPayload,
  PublishingPlatformKey,
  SocialPublishingJob,
  PublishedPlatformRecord,
} from './publishing-types';
import {
  createPublishingJob,
  getPublishingJob,
  updatePublishedPlatformRecord,
  getOAuthConnections,
  getSocialAccounts,
  getSocialLinkPreferences,
  claimFailedPublishingRecord,
  claimPendingPublishingRecord,
} from './storage';
import { resolveEligibleSocialLinks, formatSocialLinksBlock } from './link-engine';
import { getPresignedVideoUrl } from './media-presigner';
import { publishToYouTube } from './publishers/youtube-publisher';
import { publishToInstagram } from './publishers/instagram-publisher';
import { publishToFacebook } from './publishers/facebook-publisher';
import { publishToThreads } from './publishers/threads-publisher';
import { probePublishingVideo, resolvePublishingMedia } from './publishing-media';
import { validateVideoForPlatform } from './video-validator';
import { publishingPlatforms } from './oauth-state';
import { wakePublishingWorker } from './publishing-worker';

export async function dispatchPublishingJob(
  userId: string,
  origin: string,
  payload: PublishRequestPayload
): Promise<SocialPublishingJob> {
  if (!Array.isArray(payload.selectedPlatforms) || payload.selectedPlatforms.length === 0 || payload.selectedPlatforms.some(p => !publishingPlatforms.includes(p))) throw new Error('Select valid publishing platforms.');
  payload.selectedPlatforms = [...new Set(payload.selectedPlatforms)];
  if (typeof payload.defaultCaption !== 'string' || !payload.defaultCaption.trim()) throw new Error('Post caption is required.');
  const metadata = await probePublishingVideo(userId, payload.videoPath);
  if (payload.thumbnailPath) await resolvePublishingMedia(userId, payload.thumbnailPath, 'image');
  for (const platform of payload.selectedPlatforms) {
    const validation = validateVideoForPlatform(platform, metadata);
    if (!validation.isCompatible) throw new Error(validation.errors.join(' '));
  }
  if (payload.platformOverrides?.youtube && !['public', 'private', 'unlisted'].includes(payload.platformOverrides.youtube.privacyStatus)) throw new Error('Invalid YouTube privacy setting.');
  if (payload.selectedPlatforms.includes('youtube')) {
    payload.platformOverrides = { ...payload.platformOverrides, youtube: {
      title: payload.defaultTitle || 'Reel #Shorts', description: payload.defaultCaption,
      privacyStatus: 'public', madeForKids: false, ...payload.platformOverrides?.youtube,
    } };
  }
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  // 1. Fetch connected OAuth accounts
  const connections = await getOAuthConnections(userId);
  const connMap = new Map(connections.map((c) => [c.platform, c]));

  // 2. Fetch social profile link preferences
  const userAccounts = await getSocialAccounts(userId);
  const linkPrefs = await getSocialLinkPreferences(userId);

  // 3. Prepare platform records
  const platformRecords: PublishedPlatformRecord[] = [];

  for (const platform of payload.selectedPlatforms) {
    const conn = connMap.get(platform);
    let finalCaption = payload.defaultCaption;

    // Apply Smart Social Profile Links if enabled
    if (payload.showOtherSocialProfiles !== false) {
      const eligibleLinks = resolveEligibleSocialLinks(userAccounts, linkPrefs, platform);
      if (eligibleLinks.length > 0) {
        const linksBlock = formatSocialLinksBlock(eligibleLinks, linkPrefs);
        if (linksBlock) {
          finalCaption = `${finalCaption}\n\n${linksBlock}`;
        }
      }
    }

    // Apply platform-specific title / text overrides
    let postTitle = payload.defaultTitle;
    if (platform === 'youtube' && payload.platformOverrides?.youtube?.title) {
      postTitle = payload.platformOverrides.youtube.title;
      if (payload.platformOverrides.youtube.description) {
        finalCaption = payload.platformOverrides.youtube.description;
      }
    } else if (platform === 'instagram' && payload.platformOverrides?.instagram?.caption) {
      finalCaption = payload.platformOverrides.instagram.caption;
    } else if (platform === 'facebook' && payload.platformOverrides?.facebook?.description) {
      finalCaption = payload.platformOverrides.facebook.description;
    } else if (platform === 'threads' && payload.platformOverrides?.threads?.text) {
      finalCaption = payload.platformOverrides.threads.text;
    }

    platformRecords.push({
      id: `post_${platform}_${jobId}`,
      jobId,
      userId,
      platform,
      connectionId: conn?.id,
      postTitle,
      postCaption: finalCaption,
      status: 'pending',
      progressPercent: 0,
      retryCount: 0,
      idempotencyKey: `pub_${jobId}_${platform}`,
      createdAt: now,
      updatedAt: now,
    });
  }

  // 4. Save Job in Database / Storage
  const job: SocialPublishingJob = {
    id: jobId,
    userId,
    videoPath: payload.videoPath,
    thumbnailPath: payload.thumbnailPath,
    videoMetadata: { ...metadata, title: payload.defaultTitle },
    publishOptions: payload.platformOverrides || {},
    publishOrigin: origin,
    showOtherSocialProfiles: payload.showOtherSocialProfiles !== false,
    status: 'in_progress',
    platforms: platformRecords,
    createdAt: now,
    updatedAt: now,
  };

  await createPublishingJob(job);

  // 5. Fire asynchronous background execution (non-blocking)
  wakePublishingWorker();

  return job;
}

/**
 * Asynchronously publishes across selected platforms with independent error containment.
 */
export async function executePublishingJobAsync(
  job: SocialPublishingJob,
  origin: string,
  payload: PublishRequestPayload
): Promise<void> {
  // Execute each platform concurrently
  await Promise.allSettled(
    job.platforms.map(async (record) => {
      if (!(await claimPendingPublishingRecord(record.id, job.userId))) return;
      try {
        await resolvePublishingMedia(job.userId, job.videoPath);
        if (job.thumbnailPath) await resolvePublishingMedia(job.userId, job.thumbnailPath, 'image');

        const progressCb = async (percent: number) => {
          await updatePublishedPlatformRecord(record.id, { progressPercent: percent });
        };

        let postUrl = '';
        let postId = '';

        if (record.platform === 'youtube') {
          const ytRes = await publishToYouTube(
            job.userId,
            job.videoPath,
            {
              title: record.postTitle || 'Reel #Shorts',
              description: record.postCaption,
              privacyStatus: payload.platformOverrides?.youtube?.privacyStatus || 'public',
              madeForKids: payload.platformOverrides?.youtube?.madeForKids || false,
              tags: payload.platformOverrides?.youtube?.tags,
            },
            progressCb
          );
          postId = ytRes.videoId || '';
          postUrl = ytRes.videoUrl || '';
        } else if (record.platform === 'instagram') {
          const igRes = await publishToInstagram(
            job.userId,
            getPresignedVideoUrl(job.videoPath, origin, job.userId).url,
            {
              caption: record.postCaption,
              coverImageUrl: job.thumbnailPath ? getPresignedVideoUrl(job.thumbnailPath, origin, job.userId).url : undefined,
              shareToFeed: payload.platformOverrides?.instagram?.shareToFeed !== false,
            },
            progressCb
          );
          postId = igRes.mediaId || '';
          postUrl = igRes.mediaUrl || '';
        } else if (record.platform === 'facebook') {
          const fbRes = await publishToFacebook(
            job.userId,
            job.videoPath,
            {
              description: record.postCaption,
              pageId: payload.platformOverrides?.facebook?.pageId,
            },
            progressCb
          );
          postId = fbRes.reelId || '';
          postUrl = fbRes.reelUrl || '';
        } else if (record.platform === 'threads') {
          const thRes = await publishToThreads(
            job.userId,
            getPresignedVideoUrl(job.videoPath, origin, job.userId).url,
            {
              text: record.postCaption,
              topicTag: payload.platformOverrides?.threads?.topicTag,
            },
            progressCb
          );
          postId = thRes.threadId || '';
          postUrl = thRes.threadUrl || '';
        }

        // Mark Platform Published
        await updatePublishedPlatformRecord(record.id, {
          status: 'published',
          progressPercent: 100,
          platformPostId: postId,
          platformPostUrl: postUrl,
          publishedAt: new Date().toISOString(),
        });
      } catch (err: any) {
        console.error(`[Failed publishing ${record.platform}]:`, err.message);
        await updatePublishedPlatformRecord(record.id, {
          status: 'failed',
          errorMessage: err.message || `Failed to publish to ${record.platform}`,
        });
      }
    })
  );
}

/**
 * Retries a specific failed platform record.
 */
export async function retryPlatformPublish(
  userId: string,
  origin: string,
  recordId: string
): Promise<boolean> {
  const storeJob = await getPublishingJobByRecordId(recordId);
  if (!storeJob || storeJob.userId !== userId) {
    throw new Error('Publishing job not found or unauthorized');
  }

  const record = storeJob.platforms.find((p) => p.id === recordId);
  if (!record) throw new Error('Target platform record not found');
  if (record.status !== 'failed') throw new Error('Only failed posts can be retried.');
  await resolvePublishingMedia(userId, storeJob.videoPath);
  if (record.platform === 'youtube' && !storeJob.publishOptions?.youtube) throw new Error('Original privacy settings are unavailable. Create a new publishing request and confirm privacy.');

  if (!(await claimFailedPublishingRecord(record.id, userId))) throw new Error('This post is already being retried.');
  record.retryCount += 1;
  record.status = 'pending';
  record.progressPercent = 10;
  record.errorMessage = undefined;

  wakePublishingWorker();

  return true;
}

async function getPublishingJobByRecordId(recordId: string): Promise<SocialPublishingJob | null> {
  const parts = recordId.split('_');
  const jobId = parts.slice(2).join('_');
  return getPublishingJob(jobId);
}
