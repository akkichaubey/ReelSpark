import { publishingFetch } from '../publishing-fetch';
/**
 * Threads Video Post Official Publishing Client
 *
 * Implements Official Threads API 2-Step Video Publishing:
 * 1. POST /{threads_user_id}/threads?media_type=VIDEO&video_url=...&text=...
 * 2. Poll container status until FINISHED
 * 3. POST /{threads_user_id}/threads_publish?creation_id=...
 */

import { getFreshAccessToken } from '../oauth-manager';
import { getOAuthConnection } from '../storage';
import { ThreadsPostOptions } from '../publishing-types';

export interface ThreadsPublishResult {
  success: boolean;
  threadId?: string;
  threadUrl?: string;
  error?: string;
}

export async function publishToThreads(
  userId: string,
  videoPublicUrl: string,
  options: ThreadsPostOptions,
  onProgress?: (percent: number) => Promise<void>
): Promise<ThreadsPublishResult> {
  const token = await getFreshAccessToken(userId, 'threads');
  const conn = await getOAuthConnection(userId, 'threads');
  if (!conn || !conn.platformUserId) {
    throw new Error('No connected Threads user ID found.');
  }

  const threadsUserId = conn.platformUserId;

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
    const mockId = `threads_${Date.now()}`;
    return {
      success: true,
      threadId: mockId,
      threadUrl: `https://threads.net/@reelspark/post/${Date.now().toString(36)}`,
    };
  }

  // 1. Create Media Container
  const containerParams = new URLSearchParams({
    media_type: 'VIDEO',
    video_url: videoPublicUrl,
    text: options.text || '',
    access_token: token,
  });

  if (options.topicTag) {
    containerParams.set('topic_tag', options.topicTag);
  }

  const containerRes = await publishingFetch(
    `https://graph.threads.net/v1.0/${threadsUserId}/threads`,
    {
      method: 'POST',
      body: containerParams,
    }
  );

  const containerData = await containerRes.json();
  if (!containerRes.ok || !containerData.id) {
    throw new Error(
      `Threads container creation failed: ${containerData.error?.message || JSON.stringify(containerData)}`
    );
  }

  const creationId = containerData.id;
  if (onProgress) await onProgress(45);

  // 2. Poll Status until FINISHED
  let isReady = false;
  let attempts = 0;
  const maxAttempts = 30; // 90 seconds max

  while (!isReady && attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, 3000));
    attempts++;

    const statusRes = await publishingFetch(
      `https://graph.threads.net/v1.0/${creationId}?fields=status,error_message&access_token=${token}`
    );
    const statusData = await statusRes.json();
    const status = statusData.status;

    if (onProgress) {
      const pollProgress = Math.min(85, 45 + attempts * 2);
      await onProgress(pollProgress);
    }

    if (status === 'FINISHED') {
      isReady = true;
      break;
    } else if (status === 'ERROR' || status === 'EXPIRED') {
      throw new Error(`Threads video encoding failed: ${statusData.error_message || status}`);
    }
  }

  if (!isReady) {
    throw new Error('Threads video processing timed out before post could publish.');
  }

  if (onProgress) await onProgress(90);

  // 3. Publish Container
  const publishRes = await publishingFetch(
    `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish`,
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
      `Threads post publish failed: ${publishData.error?.message || JSON.stringify(publishData)}`
    );
  }

  const threadId = publishData.id;
  let permalink = `https://threads.net/post/${threadId}`;

  try {
    const metaRes = await publishingFetch(
      `https://graph.threads.net/v1.0/${threadId}?fields=permalink&access_token=${token}`
    );
    const metaData = await metaRes.json();
    if (metaData.permalink) permalink = metaData.permalink;
  } catch {}

  if (onProgress) await onProgress(100);

  return {
    success: true,
    threadId,
    threadUrl: permalink,
  };
}
