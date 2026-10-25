import { publishingFetch } from '../publishing-fetch';
/**
 * Instagram Reels Official Publishing Client
 *
 * Implements Meta Graph API 2-Step Container Publishing:
 * 1. POST /{ig_user_id}/media?media_type=REELS&video_url=...
 * 2. Poll container status until FINISHED
 * 3. POST /{ig_user_id}/media_publish?creation_id=...
 */

import { getFreshAccessToken } from '../oauth-manager';
import { getOAuthConnection } from '../storage';
import { InstagramPostOptions } from '../publishing-types';

export interface InstagramPublishResult {
  success: boolean;
  mediaId?: string;
  mediaUrl?: string;
  error?: string;
}

export async function publishToInstagram(
  userId: string,
  videoPublicUrl: string,
  options: InstagramPostOptions,
  onProgress?: (percent: number) => Promise<void>
): Promise<InstagramPublishResult> {
  const token = await getFreshAccessToken(userId, 'instagram');
  const conn = await getOAuthConnection(userId, 'instagram');
  if (!conn || !conn.platformUserId) {
    throw new Error('No Instagram Professional Account ID found in connected account.');
  }

  const igUserId = conn.platformUserId;

  if (onProgress) await onProgress(15);

  // Simulation mode for local dev / unconfigured credentials
  if (process.env.NODE_ENV === 'test' && token.startsWith('mock_')) {
    if (onProgress) {
      await onProgress(40);
      await new Promise((r) => setTimeout(r, 600));
      await onProgress(80);
      await new Promise((r) => setTimeout(r, 600));
      await onProgress(100);
    }
    const mockId = `ig_reel_${Date.now()}`;
    return {
      success: true,
      mediaId: mockId,
      mediaUrl: `https://instagram.com/reel/C_${Date.now().toString(36)}/`,
    };
  }

  // 1. Create Media Container
  const containerParams = new URLSearchParams({
    media_type: 'REELS',
    video_url: videoPublicUrl,
    caption: options.caption || '',
    access_token: token,
  });

  if (options.coverImageUrl) {
    containerParams.set('cover_url', options.coverImageUrl);
  }
  if (options.shareToFeed !== false) {
    containerParams.set('share_to_feed', 'true');
  }

  const containerRes = await publishingFetch(
    `https://graph.facebook.com/v21.0/${igUserId}/media`,
    {
      method: 'POST',
      body: containerParams,
    }
  );

  const containerData = await containerRes.json();
  if (!containerRes.ok || !containerData.id) {
    throw new Error(
      `Instagram media container creation failed: ${containerData.error?.message || JSON.stringify(containerData)}`
    );
  }

  const creationId = containerData.id;
  if (onProgress) await onProgress(45);

  // 2. Poll Status until FINISHED
  let isReady = false;
  let attempts = 0;
  const maxAttempts = 30; // 30 x 3s = 90s max wait

  while (!isReady && attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, 3000));
    attempts++;

    const statusRes = await publishingFetch(
      `https://graph.facebook.com/v21.0/${creationId}?fields=status_code&access_token=${token}`
    );
    const statusData = await statusRes.json();
    const statusCode = statusData.status_code;

    if (onProgress) {
      const pollProgress = Math.min(85, 45 + attempts * 2);
      await onProgress(pollProgress);
    }

    if (statusCode === 'FINISHED') {
      isReady = true;
      break;
    } else if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      throw new Error(`Instagram video encoding failed with status: ${statusCode}`);
    }
  }

  if (!isReady) {
    throw new Error('Instagram video processing timed out before publishing could complete.');
  }

  if (onProgress) await onProgress(90);

  // 3. Publish Container
  const publishRes = await publishingFetch(
    `https://graph.facebook.com/v21.0/${igUserId}/media_publish`,
    {
      method: 'POST',
      body: new URLSearchParams({
        creation_id: creationId,
        access_token: token,
      }),
    }
  );

  const publishData = await publishRes.json();
  if (!publishRes.ok || !publishData.id) {
    throw new Error(
      `Instagram media publish failed: ${publishData.error?.message || JSON.stringify(publishData)}`
    );
  }

  const mediaId = publishData.id;

  // Fetch permalink
  let permalink = `https://instagram.com/reel/${mediaId}`;
  try {
    const metaRes = await publishingFetch(
      `https://graph.facebook.com/v21.0/${mediaId}?fields=permalink&access_token=${token}`
    );
    const metaData = await metaRes.json();
    if (metaData.permalink) permalink = metaData.permalink;
  } catch {}

  if (onProgress) await onProgress(100);

  return {
    success: true,
    mediaId,
    mediaUrl: permalink,
  };
}
