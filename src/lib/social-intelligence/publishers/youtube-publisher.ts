import { publishingFetch } from '../publishing-fetch';
/**
 * YouTube Shorts Official Publishing Client
 *
 * Uses Google YouTube Data API v3 Resumable Chunked Upload.
 * Tags the video with #Shorts and sets privacy status.
 */

import fs from 'fs';
import { resolvePublishingMedia } from '../publishing-media';
import path from 'path';
import { getFreshAccessToken } from '../oauth-manager';
import { YouTubePostOptions } from '../publishing-types';
import { APP_CONFIG } from '../../config';

export interface YouTubePublishResult {
  success: boolean;
  videoId?: string;
  videoUrl?: string;
  error?: string;
}

export async function publishToYouTube(
  userId: string,
  videoStoragePath: string,
  options: YouTubePostOptions,
  onProgress?: (percent: number) => Promise<void>
): Promise<YouTubePublishResult> {
  const token = await getFreshAccessToken(userId, 'youtube');

  // Resolve absolute video path
  const absoluteVideoPath = await resolvePublishingMedia(userId, videoStoragePath);

  if (!fs.existsSync(absoluteVideoPath)) {
    throw new Error(`Video file not found at path: ${videoStoragePath}`);
  }

  const stat = fs.statSync(absoluteVideoPath);
  const fileSize = stat.size;

  // Ensure title contains #Shorts for guaranteed algorithmic indexing
  let title = options.title.trim();
  if (!title.toLowerCase().includes('#shorts') && title.length <= 92) {
    title = `${title} #Shorts`;
  }

  // 1. Initiate Resumable Upload Session
  const metadata = {
    snippet: {
      title,
      description: options.description || '',
      tags: options.tags || ['Shorts', 'Reels', 'AI', 'Viral'],
      categoryId: '22', // People & Blogs
    },
    status: {
      privacyStatus: options.privacyStatus || 'public',
      selfDeclaredMadeForKids: options.madeForKids || false,
    },
  };

  if (onProgress) await onProgress(10);

  // If token is a mock token, simulate real upload steps
  if (process.env.NODE_ENV === 'test' && token.startsWith('mock_')) {
    if (onProgress) {
      await onProgress(35);
      await new Promise((r) => setTimeout(r, 600));
      await onProgress(75);
      await new Promise((r) => setTimeout(r, 600));
      await onProgress(100);
    }
    const mockId = `yt_${Date.now().toString(36)}`;
    return {
      success: true,
      videoId: mockId,
      videoUrl: `https://youtube.com/shorts/${mockId}`,
    };
  }

  const initRes = await publishingFetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': fileSize.toString(),
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`YouTube resumable upload initiation failed: ${errText}`);
  }

  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) {
    throw new Error('YouTube failed to return resumable upload URL');
  }

  if (onProgress) await onProgress(30);

  // 2. Stream video file bytes
  const fileStream = fs.createReadStream(absoluteVideoPath);
  const uploadRes = await publishingFetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': fileSize.toString(),
    },
    body: fileStream as any,
    duplex: 'half',
  } as any);

  if (onProgress) await onProgress(90);

  const resultData = await uploadRes.json();
  if (!uploadRes.ok || !resultData.id) {
    throw new Error(`YouTube video upload failed: ${JSON.stringify(resultData)}`);
  }

  if (onProgress) await onProgress(100);

  const videoId = resultData.id;
  return {
    success: true,
    videoId,
    videoUrl: `https://youtube.com/shorts/${videoId}`,
  };
}
