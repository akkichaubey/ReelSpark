import { publishingFetch } from '../publishing-fetch';
/**
 * Facebook Reels Official Publishing Client
 *
 * Implements Meta Graph API Page Video Reels Upload (3 Phases):
 * 1. POST /{page_id}/video_reels?upload_phase=start
 * 2. Upload video binary stream to upload_url
 * 3. POST /{page_id}/video_reels?upload_phase=finish&video_state=PUBLISHED
 */

import fs from 'fs';
import { resolvePublishingMedia } from '../publishing-media';
import path from 'path';
import { getFreshAccessToken } from '../oauth-manager';
import { getOAuthConnection } from '../storage';
import { FacebookPostOptions } from '../publishing-types';
import { decryptToken } from '../token-encryption';
import { APP_CONFIG } from '../../config';

export interface FacebookPublishResult {
  success: boolean;
  reelId?: string;
  reelUrl?: string;
  error?: string;
}

export async function publishToFacebook(
  userId: string,
  videoStoragePath: string,
  options: FacebookPostOptions,
  onProgress?: (percent: number) => Promise<void>
): Promise<FacebookPublishResult> {
  const token = await getFreshAccessToken(userId, 'facebook');
  const conn = await getOAuthConnection(userId, 'facebook');
  if (!conn) {
    throw new Error('No connected Facebook account found.');
  }

  const pageId = options.pageId || conn.metadata?.selectedPageId || conn.platformUserId;
  // Use page access token if available, otherwise user token
  const pageToken = conn.metadata?.selectedPageAccessToken
    ? decryptToken(conn.metadata.selectedPageAccessToken)
    : token;

  // Resolve absolute video path
  const absoluteVideoPath = await resolvePublishingMedia(userId, videoStoragePath);

  if (!fs.existsSync(absoluteVideoPath)) {
    throw new Error(`Video file not found at path: ${videoStoragePath}`);
  }

  const stat = fs.statSync(absoluteVideoPath);
  const fileSize = stat.size;

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
    const mockId = `fb_reel_${Date.now()}`;
    return {
      success: true,
      reelId: mockId,
      reelUrl: `https://facebook.com/reel/${mockId}/`,
    };
  }

  // 1. Phase 1: Start Upload Session
  const initRes = await publishingFetch(
    `https://graph.facebook.com/v21.0/${pageId}/video_reels?upload_phase=start&access_token=${pageToken}`,
    { method: 'POST' }
  );

  const initData = await initRes.json();
  if (!initRes.ok || !initData.video_id || !initData.upload_url) {
    throw new Error(
      `Facebook Reel upload init failed: ${initData.error?.message || JSON.stringify(initData)}`
    );
  }

  const videoId = initData.video_id;
  const uploadUrl = initData.upload_url;

  if (onProgress) await onProgress(35);

  // 2. Phase 2: Binary Video Transfer
  const fileStream = fs.createReadStream(absoluteVideoPath);
  const uploadRes = await publishingFetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${pageToken}`,
      offset: '0',
      file_size: fileSize.toString(),
    },
    body: fileStream as any,
    duplex: 'half',
  } as any);

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Facebook Reel binary upload failed: ${errText}`);
  }

  if (onProgress) await onProgress(80);

  // 3. Phase 3: Finish & Publish Reel
  const finishParams = new URLSearchParams({
    upload_phase: 'finish',
    video_id: videoId,
    video_state: 'PUBLISHED',
    description: options.description || '',
    access_token: pageToken,
  });

  const finishRes = await publishingFetch(
    `https://graph.facebook.com/v21.0/${pageId}/video_reels`,
    {
      method: 'POST',
      body: finishParams,
    }
  );

  const finishData = await finishRes.json();
  if (!finishRes.ok || finishData.success === false) {
    throw new Error(
      `Facebook Reel finalize failed: ${finishData.error?.message || JSON.stringify(finishData)}`
    );
  }

  if (onProgress) await onProgress(100);

  return {
    success: true,
    reelId: videoId,
    reelUrl: `https://facebook.com/reel/${videoId}/`,
  };
}
