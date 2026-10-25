import { publishingFetch } from './publishing-fetch';
/**
 * ReelSpark Multi-Platform OAuth 2.0 Manager
 *
 * Handles OAuth connection generation, token exchange, automated token refresh,
 * and profile synchronization for YouTube, Instagram, Facebook, and Threads.
 */

import { encryptToken, decryptToken } from './token-encryption';
import {
  PublishingPlatformKey,
  SocialOAuthConnection,
  SafeOAuthConnection,
} from './publishing-types';
import { saveOAuthConnection, getOAuthConnection, getOAuthConnections, deleteOAuthConnection } from './storage';
import { getResolvedOAuthCredentials } from './oauth-config';

export interface OAuthRedirectConfig {
  url: string;
  state: string;
}

// ─── Client ID / Secret Accessors ───────────────────────────────────────────

export function getPlatformOAuthCredentials(platform: PublishingPlatformKey): {
  clientId: string;
  clientSecret: string;
  isConfigured: boolean;
} {
  return getResolvedOAuthCredentials(platform);
}

// ─── Authorization URL Generator ───────────────────────────────────────────

export function buildOAuthAuthorizationUrl(
  platform: PublishingPlatformKey,
  origin: string,
  state: string
): string {
  const { clientId, isConfigured } = getPlatformOAuthCredentials(platform);
  const redirectUri = `${origin}/api/social-publishing/oauth/${platform}/callback`;

  if (!isConfigured) {
    throw new Error(
      `Developer API credentials not configured for ${platform}. Please enter your ${
        platform === 'youtube'
          ? 'Google Client ID & Client Secret'
          : 'Meta App ID & App Secret'
      } to connect your real account.`
    );
  }

  switch (platform) {
    case 'youtube': {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set(
        'scope',
        'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'
      );
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
      url.searchParams.set('state', state);
      return url.toString();
    }
    case 'facebook': {
      const url = new URL('https://www.facebook.com/v21.0/dialog/oauth');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set(
        'scope',
        'pages_show_list,pages_read_engagement,pages_manage_posts,publish_video'
      );
      url.searchParams.set('state', state);
      return url.toString();
    }
    case 'instagram': {
      const url = new URL('https://www.facebook.com/v21.0/dialog/oauth');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set(
        'scope',
        'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement'
      );
      url.searchParams.set('state', state);
      return url.toString();
    }
    case 'threads': {
      const url = new URL('https://threads.net/oauth/authorize');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'threads_basic,threads_content_publish');
      url.searchParams.set('state', state);
      return url.toString();
    }
  }
}

// ─── Code Exchange & Account Setup ──────────────────────────────────────────

export async function exchangeOAuthCode(
  platform: PublishingPlatformKey,
  code: string,
  origin: string,
  userId: string
): Promise<SocialOAuthConnection> {
  const redirectUri = `${origin}/api/social-publishing/oauth/${platform}/callback`;
  const { clientId, clientSecret, isConfigured } = getPlatformOAuthCredentials(platform);

  if (!isConfigured) {
    throw new Error(
      `Cannot complete ${platform} authorization: developer API credentials are not configured.`
    );
  }

  // 1. YouTube Code Exchange
  if (platform === 'youtube') {
    const tokenRes = await publishingFetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || 'Failed to exchange YouTube authorization code');
    }

    // Fetch Channel Profile
    const channelRes = await publishingFetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );
    const channelData = await channelRes.json();
    const channel = channelData.items?.[0];

    const connection: SocialOAuthConnection = {
      id: `oauth_yt_${userId}`,
      userId,
      platform: 'youtube',
      platformUserId: channel?.id || 'unknown_channel',
      accountName: channel?.snippet?.title || 'YouTube Channel',
      accountHandle: channel?.snippet?.customUrl || `@${channel?.snippet?.title || 'channel'}`,
      avatarUrl: channel?.snippet?.thumbnails?.default?.url,
      accessToken: encryptToken(tokenData.access_token),
      refreshToken: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : undefined,
      tokenExpiresAt: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : undefined,
      scope: tokenData.scope || 'youtube.upload',
      metadata: {
        channelId: channel?.id,
        channelTitle: channel?.snippet?.title,
      },
      status: 'connected',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveOAuthConnection(connection);
    return connection;
  }

  // 2. Facebook Code Exchange
  if (platform === 'facebook') {
    const tokenRes = await publishingFetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&client_secret=${clientSecret}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error?.message || 'Failed to exchange Facebook authorization code');
    }

    // Exchange for long-lived user token (60 days)
    const longLivedRes = await publishingFetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${tokenData.access_token}`
    );
    const longLivedData = await longLivedRes.json();
    const finalUserToken = longLivedData.access_token || tokenData.access_token;

    // Fetch User & Managed Pages
    const pagesRes = await publishingFetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,picture&access_token=${finalUserToken}`
    );
    const pagesData = await pagesRes.json();
    const defaultPage = pagesData.data?.[0];

    const connection: SocialOAuthConnection = {
      id: `oauth_fb_${userId}`,
      userId,
      platform: 'facebook',
      platformUserId: defaultPage?.id || 'fb_user_profile',
      accountName: defaultPage?.name || 'Facebook Profile',
      accountHandle: defaultPage?.id ? `@${defaultPage.id}` : undefined,
      avatarUrl: defaultPage?.picture?.data?.url,
      accessToken: encryptToken(finalUserToken),
      tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      scope: 'pages_manage_posts,publish_video',
      metadata: {
        selectedPageId: defaultPage?.id,
        selectedPageName: defaultPage?.name,
        selectedPageAccessToken: defaultPage?.access_token
          ? encryptToken(defaultPage.access_token)
          : undefined,
      },
      status: 'connected',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveOAuthConnection(connection);
    return connection;
  }

  // 3. Instagram Code Exchange
  if (platform === 'instagram') {
    const tokenRes = await publishingFetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&client_secret=${clientSecret}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error?.message || 'Failed to exchange Instagram authorization code');
    }

    // Exchange for long-lived user token
    const longLivedRes = await publishingFetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${tokenData.access_token}`
    );
    const longLivedData = await longLivedRes.json();
    const finalToken = longLivedData.access_token || tokenData.access_token;

    // Find linked Instagram Professional Account
    const accountsRes = await publishingFetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account{id,username,name,profile_picture_url}&access_token=${finalToken}`
    );
    const accountsData = await accountsRes.json();
    const pageWithIg = accountsData.data?.find((p: any) => p.instagram_business_account);
    const igAccount = pageWithIg?.instagram_business_account;

    if (!igAccount) {
      throw new Error(
        'No Instagram Professional (Creator/Business) account found linked to your Facebook Pages. Please link your Instagram account to a Facebook Page to publish Reels.'
      );
    }

    const connection: SocialOAuthConnection = {
      id: `oauth_ig_${userId}`,
      userId,
      platform: 'instagram',
      platformUserId: igAccount.id,
      accountName: igAccount.name || igAccount.username,
      accountHandle: `@${igAccount.username}`,
      avatarUrl: igAccount.profile_picture_url,
      accessToken: encryptToken(finalToken),
      tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      scope: 'instagram_content_publish',
      metadata: {
        selectedPageId: pageWithIg.id,
        selectedPageName: pageWithIg.name,
      },
      status: 'connected',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveOAuthConnection(connection);
    return connection;
  }

  // 4. Threads Code Exchange
  if (platform === 'threads') {
    const tokenRes = await publishingFetch('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_message || 'Failed to exchange Threads authorization code');
    }

    // Exchange for long-lived Threads token (60 days)
    const longLivedRes = await publishingFetch(
      `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${clientSecret}&access_token=${tokenData.access_token}`
    );
    const longLivedData = await longLivedRes.json();
    const finalThreadsToken = longLivedData.access_token || tokenData.access_token;

    // Fetch Threads User Profile
    const userRes = await publishingFetch(
      `https://graph.threads.net/v1.0/me?fields=id,username,name,threads_profile_picture_url&access_token=${finalThreadsToken}`
    );
    const userData = await userRes.json();

    const connection: SocialOAuthConnection = {
      id: `oauth_threads_${userId}`,
      userId,
      platform: 'threads',
      platformUserId: userData.id || tokenData.user_id,
      accountName: userData.name || userData.username || 'Threads Profile',
      accountHandle: userData.username ? `@${userData.username}` : undefined,
      avatarUrl: userData.threads_profile_picture_url,
      accessToken: encryptToken(finalThreadsToken),
      tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      scope: 'threads_content_publish',
      metadata: {},
      status: 'connected',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveOAuthConnection(connection);
    return connection;
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

// ─── Token Refresh & Safe Serializer ────────────────────────────────────────

export async function getFreshAccessToken(
  userId: string,
  platform: PublishingPlatformKey
): Promise<string> {
  const connection = await getOAuthConnection(userId, platform);
  if (!connection) {
    throw new Error(`No connected ${platform} account found. Please connect your account first.`);
  }

  const plainAccessToken = decryptToken(connection.accessToken);

  // Check if expired
  const isExpired = connection.tokenExpiresAt
    ? new Date(connection.tokenExpiresAt).getTime() <= Date.now() + 5 * 60 * 1000
    : false;

  if (!isExpired) {
    return plainAccessToken;
  }

  // Handle YouTube Token Refresh
  if (platform === 'youtube' && connection.refreshToken) {
    const plainRefreshToken = decryptToken(connection.refreshToken);
    const { clientId, clientSecret } = getPlatformOAuthCredentials('youtube');

    const res = await publishingFetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: plainRefreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const data = await res.json();
    if (res.ok && data.access_token) {
      connection.accessToken = encryptToken(data.access_token);
      if (data.expires_in) {
        connection.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
      }
      connection.status = 'connected';
      await saveOAuthConnection(connection);
      return data.access_token;
    }
  }

  // If cannot refresh automatically, mark connection as expired
  connection.status = 'expired';
  connection.lastError = 'Session expired. Reconnect authorization required.';
  await saveOAuthConnection(connection);
  throw new Error(`${platform} authorization has expired. Please reconnect your account.`);
}

export function toSafeOAuthConnection(conn: SocialOAuthConnection): SafeOAuthConnection {
  const isExpired = conn.tokenExpiresAt
    ? new Date(conn.tokenExpiresAt).getTime() <= Date.now()
    : false;

  return {
    id: conn.id,
    userId: conn.userId,
    platform: conn.platform,
    platformUserId: conn.platformUserId,
    accountName: conn.accountName,
    accountHandle: conn.accountHandle,
    avatarUrl: conn.avatarUrl,
    scope: conn.scope,
    status: isExpired ? 'expired' : conn.status,
    lastError: conn.lastError,
    metadata: {
      selectedPageId: conn.metadata?.selectedPageId,
      selectedPageName: conn.metadata?.selectedPageName,
      channelId: conn.metadata?.channelId,
      channelTitle: conn.metadata?.channelTitle,
    },
    hasRefreshToken: Boolean(conn.refreshToken),
    isExpired,
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt,
  };
}
