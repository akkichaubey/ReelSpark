import { randomUUID } from 'node:crypto';
/**
 * ReelSpark Social Intelligence — Storage & Persistence Service
 *
 * Persists User Profiles, Social Accounts, and Link Preferences using
 * Cloudflare D1 with resilient local JSON fallback.
 */

import fs from 'fs';
import path from 'path';
import { d1Query, getD1Status } from '../cloudflare/d1';
import { APP_CONFIG } from '../config';
import { ExtendedUserProfile, SocialAccount, SocialLinkPreferences, SocialPlatformKey } from './types';
import { normalizeSocialUrl, validatePlatformUrl } from './link-engine';
import {
  PublishingPlatformKey,
  SocialOAuthConnection,
  SocialPublishingJob,
  PublishedPlatformRecord,
} from './publishing-types';

interface LocalSocialStore {
  profiles: Record<string, ExtendedUserProfile>;
  accounts: SocialAccount[];
  preferences: Record<string, SocialLinkPreferences>;
  oauthConnections: SocialOAuthConnection[];
  publishingJobs: SocialPublishingJob[];
  publishedPosts: PublishedPlatformRecord[];
}

function getLocalStoreFilePath(): string {
  return path.join(APP_CONFIG.storageRoot, 'social_intelligence_store.json');
}

function readLocalSocialStore(): LocalSocialStore {
  try {
    const file = getLocalStoreFilePath();
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return {
        profiles: data.profiles || {},
        accounts: data.accounts || [],
        preferences: data.preferences || {},
        oauthConnections: data.oauthConnections || [],
        publishingJobs: data.publishingJobs || [],
        publishedPosts: data.publishedPosts || [],
      };
    }
  } catch (err) {
    console.warn('[Social Intelligence] Failed to read local social store:', err);
  }
  return {
    profiles: {},
    accounts: [],
    preferences: {},
    oauthConnections: [],
    publishingJobs: [],
    publishedPosts: [],
  };
}

function writeLocalSocialStore(data: LocalSocialStore): void {
  try {
    const file = getLocalStoreFilePath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const temporary = file + '.' + randomUUID() + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, file);
  } catch (err) {
    throw new Error('Social data could not be saved to server storage.');
  }
}

// ─── User Profile Methods ───────────────────────────────────────────────────

export async function getUserProfile(userId: string): Promise<ExtendedUserProfile | null> {
  if (!userId) return null;
  const d1 = getD1Status();

  if (d1.configured) {
    try {
      const res = await d1Query<{
        user_id: string;
        name: string;
        email: string;
        first_name: string | null;
        last_name: string | null;
        avatar_url: string | null;
        bio: string | null;
        preferences: string;
        updated_at: string;
      }>(
        `SELECT u.id as user_id, u.name, u.email, p.first_name, p.last_name, p.avatar_url, p.bio, p.preferences, p.updated_at
         FROM users u
         LEFT JOIN user_profiles p ON u.id = p.user_id
         WHERE u.id = ? LIMIT 1`,
        [userId]
      );

      if (res.results.length > 0) {
        const row = res.results[0];
        let prefs = {};
        try {
          if (row.preferences) prefs = JSON.parse(row.preferences);
        } catch {}

        return {
          userId: row.user_id,
          name: row.name,
          email: row.email,
          firstName: row.first_name || undefined,
          lastName: row.last_name || undefined,
          avatarUrl: row.avatar_url || undefined,
          bio: row.bio || undefined,
          preferences: prefs,
          updatedAt: row.updated_at || new Date().toISOString(),
        };
      }
    } catch (err) {
      console.warn('[Social Intelligence] D1 getUserProfile fallback:', err);
    }
  }

  // Local fallback
  const store = readLocalSocialStore();
  const profile = store.profiles[userId];
  if (profile) return profile;

  // Generate initial default profile from auth_store if exists
  return {
    userId,
    name: '',
    email: '',
    preferences: {
      defaultTone: 'motivational',
      defaultLanguage: 'en',
      defaultPlatform: 'instagram',
    },
    updatedAt: new Date().toISOString(),
  };
}

export async function saveUserProfile(
  userId: string,
  updates: Partial<ExtendedUserProfile>
): Promise<ExtendedUserProfile> {
  const existing = (await getUserProfile(userId)) || {
    userId,
    name: updates.name || '',
    email: updates.email || '',
    preferences: {},
    updatedAt: new Date().toISOString(),
  };

  const updated: ExtendedUserProfile = {
    ...existing,
    ...updates,
    userId,
    preferences: {
      ...existing.preferences,
      ...(updates.preferences || {}),
    },
    updatedAt: new Date().toISOString(),
  };

  const d1 = getD1Status();
  if (d1.configured) {
    try {
      await d1Query(
        `INSERT INTO user_profiles (user_id, first_name, last_name, avatar_url, bio, preferences, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           first_name = excluded.first_name,
           last_name = excluded.last_name,
           avatar_url = excluded.avatar_url,
           bio = excluded.bio,
           preferences = excluded.preferences,
           updated_at = excluded.updated_at`,
        [
          userId,
          updated.firstName || null,
          updated.lastName || null,
          updated.avatarUrl || null,
          updated.bio || null,
          JSON.stringify(updated.preferences),
          updated.updatedAt,
        ]
      );
    } catch (err) {
      console.warn('[Social Intelligence] D1 saveUserProfile fallback:', err);
    }
  }

  const store = readLocalSocialStore();
  store.profiles[userId] = updated;
  writeLocalSocialStore(store);

  return updated;
}

// ─── Social Accounts Methods ─────────────────────────────────────────────────

export async function getSocialAccounts(userId: string): Promise<SocialAccount[]> {
  if (!userId) return [];
  const d1 = getD1Status();

  if (d1.configured) {
    try {
      const res = await d1Query<{
        id: string;
        user_id: string;
        platform: string;
        account_url: string;
        display_name: string | null;
        is_primary: number;
        enabled: number;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT id, user_id, platform, account_url, display_name, is_primary, enabled, created_at, updated_at
         FROM social_accounts
         WHERE user_id = ?
         ORDER BY platform ASC, is_primary DESC, created_at ASC`,
        [userId]
      );

      return res.results.map((row) => ({
        id: row.id,
        userId: row.user_id,
        platform: row.platform as SocialPlatformKey,
        accountUrl: row.account_url,
        displayName: row.display_name || undefined,
        isPrimary: Boolean(row.is_primary),
        enabled: Boolean(row.enabled),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (err) {
      console.warn('[Social Intelligence] D1 getSocialAccounts fallback:', err);
    }
  }

  const store = readLocalSocialStore();
  return store.accounts.filter((a) => a.userId === userId);
}

export async function addSocialAccount(
  userId: string,
  input: {
    platform: SocialPlatformKey;
    accountUrl: string;
    displayName?: string;
    isPrimary?: boolean;
  }
): Promise<{ success: boolean; account?: SocialAccount; error?: string }> {
  if (!userId) return { success: false, error: 'Unauthorized: User ID required' };

  // Validate URL format and domain
  const validation = validatePlatformUrl(input.accountUrl, input.platform);
  if (!validation.valid) {
    return { success: false, error: validation.reason || 'Invalid URL for selected platform' };
  }

  const normalizedUrl = normalizeSocialUrl(input.accountUrl, input.platform);

  // Check existing accounts for user
  const existingAccounts = await getSocialAccounts(userId);

  // Check duplicate URL
  const isDuplicate = existingAccounts.some(
    (a) => a.platform === input.platform && normalizeSocialUrl(a.accountUrl, a.platform).toLowerCase() === normalizedUrl.toLowerCase()
  );
  if (isDuplicate) {
    return { success: false, error: 'This social account URL is already added to your profile' };
  }

  const now = new Date().toISOString();
  const accountId = `soc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Determine if this should be primary (if user requested or if it's the first account for this platform)
  const isFirstForPlatform = !existingAccounts.some((a) => a.platform === input.platform);
  const isPrimary = Boolean(input.isPrimary || isFirstForPlatform);

  const newAccount: SocialAccount = {
    id: accountId,
    userId,
    platform: input.platform,
    accountUrl: normalizedUrl,
    displayName: input.displayName?.trim() || undefined,
    isPrimary,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  const d1 = getD1Status();
  if (d1.configured) {
    try {
      // If setting as primary, demote other accounts of same platform
      if (isPrimary) {
        await d1Query(
          `UPDATE social_accounts SET is_primary = 0 WHERE user_id = ? AND platform = ?`,
          [userId, input.platform]
        );
      }

      await d1Query(
        `INSERT INTO social_accounts (id, user_id, platform, account_url, display_name, is_primary, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newAccount.id,
          newAccount.userId,
          newAccount.platform,
          newAccount.accountUrl,
          newAccount.displayName || null,
          newAccount.isPrimary ? 1 : 0,
          newAccount.enabled ? 1 : 0,
          newAccount.createdAt,
          newAccount.updatedAt,
        ]
      );
    } catch (err: any) {
      console.warn('[Social Intelligence] D1 addSocialAccount error:', err.message);
    }
  }

  // Update local store
  const store = readLocalSocialStore();
  if (isPrimary) {
    store.accounts = store.accounts.map((a) =>
      a.userId === userId && a.platform === input.platform ? { ...a, isPrimary: false } : a
    );
  }
  store.accounts.push(newAccount);
  writeLocalSocialStore(store);

  return { success: true, account: newAccount };
}

export async function updateSocialAccount(
  userId: string,
  accountId: string,
  updates: Partial<{
    accountUrl: string;
    displayName: string;
    isPrimary: boolean;
    enabled: boolean;
  }>
): Promise<{ success: boolean; account?: SocialAccount; error?: string }> {
  const accounts = await getSocialAccounts(userId);
  const target = accounts.find((a) => a.id === accountId);
  if (!target) {
    return { success: false, error: 'Account not found or unauthorized' };
  }

  let finalUrl = target.accountUrl;
  if (updates.accountUrl) {
    const validation = validatePlatformUrl(updates.accountUrl, target.platform);
    if (!validation.valid) {
      return { success: false, error: validation.reason || 'Invalid URL' };
    }
    finalUrl = normalizeSocialUrl(updates.accountUrl, target.platform);

    const isDuplicate = accounts.some(
      (a) =>
        a.id !== accountId &&
        a.platform === target.platform &&
        normalizeSocialUrl(a.accountUrl, a.platform).toLowerCase() === finalUrl.toLowerCase()
    );
    if (isDuplicate) {
      return { success: false, error: 'This social account URL or handle is already added to your profile' };
    }
  }

  const isPrimary = updates.isPrimary !== undefined ? updates.isPrimary : target.isPrimary;
  const enabled = updates.enabled !== undefined ? updates.enabled : target.enabled;
  const displayName = updates.displayName !== undefined ? updates.displayName.trim() : target.displayName;
  const now = new Date().toISOString();

  const updatedAccount: SocialAccount = {
    ...target,
    accountUrl: finalUrl,
    displayName: displayName || undefined,
    isPrimary,
    enabled,
    updatedAt: now,
  };

  const d1 = getD1Status();
  if (d1.configured) {
    try {
      if (isPrimary) {
        await d1Query(
          `UPDATE social_accounts SET is_primary = 0 WHERE user_id = ? AND platform = ? AND id != ?`,
          [userId, target.platform, accountId]
        );
      }
      await d1Query(
        `UPDATE social_accounts
         SET account_url = ?, display_name = ?, is_primary = ?, enabled = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [
          finalUrl,
          displayName || null,
          isPrimary ? 1 : 0,
          enabled ? 1 : 0,
          now,
          accountId,
          userId,
        ]
      );
    } catch (err) {
      console.warn('[Social Intelligence] D1 updateSocialAccount error:', err);
    }
  }

  const store = readLocalSocialStore();
  store.accounts = store.accounts.map((a) => {
    if (a.userId === userId && a.platform === target.platform && isPrimary && a.id !== accountId) {
      return { ...a, isPrimary: false };
    }
    return a.id === accountId && a.userId === userId ? updatedAccount : a;
  });
  writeLocalSocialStore(store);

  return { success: true, account: updatedAccount };
}

export async function deleteSocialAccount(
  userId: string,
  accountId: string
): Promise<{ success: boolean; error?: string }> {
  const accounts = await getSocialAccounts(userId);
  const target = accounts.find((a) => a.id === accountId);
  if (!target) {
    return { success: false, error: 'Account not found or unauthorized' };
  }

  const d1 = getD1Status();
  if (d1.configured) {
    try {
      await d1Query('DELETE FROM social_accounts WHERE id = ? AND user_id = ?', [accountId, userId]);
    } catch (err) {
      console.warn('[Social Intelligence] D1 deleteSocialAccount error:', err);
    }
  }

  const store = readLocalSocialStore();
  store.accounts = store.accounts.filter((a) => !(a.id === accountId && a.userId === userId));
  writeLocalSocialStore(store);

  return { success: true };
}

// ─── Social Link Preferences Methods ─────────────────────────────────────────

export const DEFAULT_LINK_PREFERENCES: Omit<SocialLinkPreferences, 'userId' | 'updatedAt'> = {
  includeWebsite: true,
  includeOtherSocials: true,
  excludeTargetPlatform: true, // Target platform excluded by default per specification!
  customHeading: '',
  threeDotsSpacer: true,
  displaySeparateLines: true,
  linkOrder: ['youtube', 'instagram', 'threads', 'facebook', 'website'],
  eligibleAccountIds: [],
  fixedHashtags: [],
};

export async function getSocialLinkPreferences(userId: string): Promise<SocialLinkPreferences> {
  if (!userId) {
    return {
      userId: '',
      ...DEFAULT_LINK_PREFERENCES,
      updatedAt: new Date().toISOString(),
    };
  }

  // Retrieve user profile to merge custom fixed hashtags if present
  let profileHashtags = DEFAULT_LINK_PREFERENCES.fixedHashtags;
  try {
    const profile = await getUserProfile(userId);
    if (profile?.preferences?.fixedHashtags) {
      profileHashtags = profile.preferences.fixedHashtags;
    }
  } catch {}

  const d1 = getD1Status();
  if (d1.configured) {
    try {
      const res = await d1Query<{
        user_id: string;
        include_website: number;
        include_other_socials: number;
        exclude_target_platform: number;
        custom_heading: string;
        display_separate_lines: number;
        link_order: string;
        eligible_account_ids: string;
        updated_at: string;
      }>(
        `SELECT user_id, include_website, include_other_socials, exclude_target_platform,
                custom_heading, display_separate_lines, link_order, eligible_account_ids, updated_at
         FROM social_link_preferences WHERE user_id = ? LIMIT 1`,
        [userId]
      );

      if (res.results.length > 0) {
        const row = res.results[0];
        let linkOrder = DEFAULT_LINK_PREFERENCES.linkOrder;
        let eligibleAccountIds: string[] = [];
        try {
          if (row.link_order) linkOrder = JSON.parse(row.link_order);
          if (row.eligible_account_ids) eligibleAccountIds = JSON.parse(row.eligible_account_ids);
        } catch {}

        return {
          userId: row.user_id,
          includeWebsite: Boolean(row.include_website),
          includeOtherSocials: Boolean(row.include_other_socials),
          excludeTargetPlatform: Boolean(row.exclude_target_platform),
          customHeading: row.custom_heading || DEFAULT_LINK_PREFERENCES.customHeading,
          displaySeparateLines: Boolean(row.display_separate_lines),
          linkOrder,
          eligibleAccountIds,
          fixedHashtags: profileHashtags,
          updatedAt: row.updated_at,
        };
      }
    } catch (err) {
      console.warn('[Social Intelligence] D1 getSocialLinkPreferences fallback:', err);
    }
  }

  const store = readLocalSocialStore();
  const existing = store.preferences[userId];
  if (existing) {
    return {
      ...existing,
      fixedHashtags: existing.fixedHashtags || profileHashtags,
    };
  }

  return {
    userId,
    ...DEFAULT_LINK_PREFERENCES,
    fixedHashtags: profileHashtags,
    updatedAt: new Date().toISOString(),
  };
}

export async function saveSocialLinkPreferences(
  userId: string,
  updates: Partial<SocialLinkPreferences>
): Promise<SocialLinkPreferences> {
  const existing = await getSocialLinkPreferences(userId);

  // Persist fixed hashtags to user profile preferences
  if (updates.fixedHashtags !== undefined) {
    try {
      const profile = await getUserProfile(userId);
      await saveUserProfile(userId, {
        preferences: {
          ...(profile?.preferences || {}),
          fixedHashtags: updates.fixedHashtags,
        },
      });
    } catch (err) {
      console.warn('[Social Intelligence] Failed to save fixedHashtags to profile:', err);
    }
  }

  const updated: SocialLinkPreferences = {
    ...existing,
    ...updates,
    userId,
    updatedAt: new Date().toISOString(),
  };

  const d1 = getD1Status();
  if (d1.configured) {
    try {
      await d1Query(
        `INSERT INTO social_link_preferences (
          user_id, include_website, include_other_socials, exclude_target_platform,
          custom_heading, display_separate_lines, link_order, eligible_account_ids, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           include_website = excluded.include_website,
           include_other_socials = excluded.include_other_socials,
           exclude_target_platform = excluded.exclude_target_platform,
           custom_heading = excluded.custom_heading,
           display_separate_lines = excluded.display_separate_lines,
           link_order = excluded.link_order,
           eligible_account_ids = excluded.eligible_account_ids,
           updated_at = excluded.updated_at`,
        [
          userId,
          updated.includeWebsite ? 1 : 0,
          updated.includeOtherSocials ? 1 : 0,
          updated.excludeTargetPlatform ? 1 : 0,
          updated.customHeading,
          updated.displaySeparateLines ? 1 : 0,
          JSON.stringify(updated.linkOrder || []),
          JSON.stringify(updated.eligibleAccountIds || []),
          updated.updatedAt,
        ]
      );
    } catch (err) {
      console.warn('[Social Intelligence] D1 saveSocialLinkPreferences error:', err);
    }
  }

  const store = readLocalSocialStore();
  store.preferences[userId] = updated;
  writeLocalSocialStore(store);

  return updated;
}

// ─── OAuth Connections Storage ──────────────────────────────────────────────

export async function getOAuthConnections(userId: string): Promise<SocialOAuthConnection[]> {
  if (!userId) return [];
  const d1 = getD1Status();

  if (d1.configured) {
    try {
      const res = await d1Query<{
        id: string;
        user_id: string;
        platform: string;
        platform_user_id: string;
        account_name: string;
        account_handle: string | null;
        avatar_url: string | null;
        access_token: string;
        refresh_token: string | null;
        token_expires_at: string | null;
        scope: string;
        metadata: string;
        status: string;
        last_error: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT * FROM social_oauth_connections WHERE user_id = ? ORDER BY platform ASC`,
        [userId]
      );

      if (res.results) {
        return res.results.map((r) => {
          let meta = {};
          try {
            if (r.metadata) meta = JSON.parse(r.metadata);
          } catch {}
          return {
            id: r.id,
            userId: r.user_id,
            platform: r.platform as PublishingPlatformKey,
            platformUserId: r.platform_user_id,
            accountName: r.account_name,
            accountHandle: r.account_handle || undefined,
            avatarUrl: r.avatar_url || undefined,
            accessToken: r.access_token,
            refreshToken: r.refresh_token || undefined,
            tokenExpiresAt: r.token_expires_at || undefined,
            scope: r.scope,
            metadata: meta,
            status: r.status as any,
            lastError: r.last_error || undefined,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          };
        });
      }
    } catch (err) {
      throw new Error('Connected accounts could not be loaded from the publishing database.');
    }
  }

  // Local fallback
  const store = readLocalSocialStore();
  return (store.oauthConnections || []).filter((c) => c.userId === userId);
}

export async function getOAuthConnection(
  userId: string,
  platform: PublishingPlatformKey
): Promise<SocialOAuthConnection | null> {
  const connections = await getOAuthConnections(userId);
  return connections.find((c) => c.platform === platform) || null;
}

export async function saveOAuthConnection(
  conn: SocialOAuthConnection
): Promise<{ success: boolean; connection?: SocialOAuthConnection; error?: string }> {
  const now = new Date().toISOString();
  const normalized: SocialOAuthConnection = {
    ...conn,
    updatedAt: now,
    createdAt: conn.createdAt || now,
  };

  const d1 = getD1Status();
  if (d1.configured) {
    try {
      await d1Query(
        `INSERT INTO social_oauth_connections (
          id, user_id, platform, platform_user_id, account_name, account_handle, avatar_url,
          access_token, refresh_token, token_expires_at, scope, metadata, status, last_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          platform_user_id = excluded.platform_user_id,
          account_name = excluded.account_name,
          account_handle = excluded.account_handle,
          avatar_url = excluded.avatar_url,
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          token_expires_at = excluded.token_expires_at,
          scope = excluded.scope,
          metadata = excluded.metadata,
          status = excluded.status,
          last_error = excluded.last_error,
          updated_at = excluded.updated_at`,
        [
          normalized.id,
          normalized.userId,
          normalized.platform,
          normalized.platformUserId,
          normalized.accountName,
          normalized.accountHandle || null,
          normalized.avatarUrl || null,
          normalized.accessToken,
          normalized.refreshToken || null,
          normalized.tokenExpiresAt || null,
          normalized.scope,
          JSON.stringify(normalized.metadata || {}),
          normalized.status,
          normalized.lastError || null,
          normalized.createdAt,
          normalized.updatedAt,
        ]
      );
      return { success: true, connection: normalized };
    } catch (err: any) {
      throw new Error('Connected account could not be saved to the publishing database.');
    }
  }

  // Local fallback
  const store = readLocalSocialStore();
  const existingIdx = store.oauthConnections.findIndex(
    (c) => c.userId === normalized.userId && c.platform === normalized.platform
  );
  if (existingIdx >= 0) {
    store.oauthConnections[existingIdx] = normalized;
  } else {
    store.oauthConnections.push(normalized);
  }
  writeLocalSocialStore(store);

  return { success: true, connection: normalized };
}

export async function deleteOAuthConnection(
  userId: string,
  platform: PublishingPlatformKey
): Promise<{ success: boolean; error?: string }> {
  const d1 = getD1Status();
  if (d1.configured) {
    try {
      await d1Query(
        `DELETE FROM social_oauth_connections WHERE user_id = ? AND platform = ?`,
        [userId, platform]
      );
      return { success: true };
    } catch (err: any) {
      throw new Error('Connected account could not be removed from the publishing database.');
    }
  }

  const store = readLocalSocialStore();
  store.oauthConnections = store.oauthConnections.filter(
    (c) => !(c.userId === userId && c.platform === platform)
  );
  writeLocalSocialStore(store);

  return { success: true };
}

// ─── Publishing Jobs & Post History Storage ─────────────────────────────────

export async function createPublishingJob(
  job: SocialPublishingJob
): Promise<{ success: boolean; job: SocialPublishingJob }> {
  const d1 = getD1Status();
  if (d1.configured) {
    try {
      // 1. Insert main job
      await d1Query(
        `INSERT INTO social_publishing_jobs (
          id, user_id, video_path, thumbnail_path, video_metadata, show_other_socials, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          job.id,
          job.userId,
          job.videoPath,
          job.thumbnailPath || null,
          JSON.stringify({ ...job.videoMetadata, _publishingOptions: job.publishOptions || {}, _publishingOrigin: job.publishOrigin }),
          job.showOtherSocialProfiles ? 1 : 0,
          'preparing',
          job.createdAt,
          job.updatedAt,
        ]
      );

      // 2. Insert target platform records
      for (const p of job.platforms) {
        await d1Query(
          `INSERT INTO social_published_posts (
            id, job_id, user_id, platform, connection_id, post_title, post_caption,
            status, progress_percent, platform_post_id, platform_post_url, error_message,
            retry_count, idempotency_key, published_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            p.id,
            job.id,
            job.userId,
            p.platform,
            p.connectionId || null,
            p.postTitle || null,
            p.postCaption,
            p.status,
            p.progressPercent,
            p.platformPostId || null,
            p.platformPostUrl || null,
            p.errorMessage || null,
            p.retryCount,
            p.idempotencyKey,
            p.publishedAt || null,
            p.createdAt,
            p.updatedAt,
          ]
        );
      }
      await d1Query('UPDATE social_publishing_jobs SET status = ? WHERE id = ? AND user_id = ?', [job.status, job.id, job.userId]);
      return { success: true, job };
    } catch (err: any) {
      throw new Error('Publishing database write failed. No publishing was started.');
    }
  }

  // Local fallback
  const store = readLocalSocialStore();
  store.publishingJobs.unshift(job);
  for (const p of job.platforms) {
    store.publishedPosts.unshift(p);
  }
  writeLocalSocialStore(store);

  return { success: true, job };
}


function decodePublishingJob(row: Record<string, any>, platforms: PublishedPlatformRecord[]): SocialPublishingJob {
  const { _publishingOptions, _publishingOrigin, ...metadata } = JSON.parse(row.video_metadata || '{}');
  return { id: row.id, userId: row.user_id, videoPath: row.video_path, thumbnailPath: row.thumbnail_path || undefined,
    videoMetadata: metadata as SocialPublishingJob['videoMetadata'], publishOptions: _publishingOptions, publishOrigin: _publishingOrigin,
    showOtherSocialProfiles: Boolean(row.show_other_socials), status: row.status, platforms,
    createdAt: row.created_at, updatedAt: row.updated_at };
}
function decodePublishedPost(r: Record<string, any>): PublishedPlatformRecord {
  return { id: r.id, jobId: r.job_id, userId: r.user_id, platform: r.platform, connectionId: r.connection_id || undefined,
    postTitle: r.post_title || undefined, postCaption: r.post_caption, status: r.status, progressPercent: r.progress_percent,
    platformPostId: r.platform_post_id || undefined, platformPostUrl: r.platform_post_url || undefined,
    errorMessage: r.error_message || undefined, retryCount: r.retry_count, idempotencyKey: r.idempotency_key,
    publishedAt: r.published_at || undefined, createdAt: r.created_at, updatedAt: r.updated_at };
}
function overallStatus(records: PublishedPlatformRecord[]): SocialPublishingJob['status'] {
  if (records.every(p => p.status === 'published')) return 'completed';
  if (records.every(p => p.status === 'failed')) return 'failed';
  if (records.some(p => ['pending','uploading','processing','publishing'].includes(p.status))) return 'in_progress';
  return 'partial';
}
export async function getPublishingJob(jobId: string, userId?: string): Promise<SocialPublishingJob | null> {
  if (getD1Status().configured) {
    const result = await d1Query<Record<string, any>>('SELECT * FROM social_publishing_jobs WHERE id = ?' + (userId ? ' AND user_id = ?' : ''), userId ? [jobId,userId] : [jobId]);
    const row = result.results[0];
    if (!row) return null;
    const posts = await d1Query<Record<string, any>>('SELECT * FROM social_published_posts WHERE job_id = ? AND user_id = ?', [jobId,row.user_id]);
    return decodePublishingJob(row, posts.results.map(decodePublishedPost));
  }
  const store = readLocalSocialStore();
  const job = store.publishingJobs.find(j => j.id === jobId && (!userId || j.userId === userId));
  return job ? { ...job, platforms: store.publishedPosts.filter(p => p.jobId === jobId && p.userId === job.userId) } : null;
}

export async function updatePublishedPlatformRecord(recordId: string, updates: Partial<PublishedPlatformRecord>): Promise<boolean> {
  const now = new Date().toISOString();
  if (getD1Status().configured) {
    const result = await d1Query<Record<string, any>>('SELECT * FROM social_published_posts WHERE id = ?', [recordId]);
    const row = result.results[0];
    if (!row) return false;
    const columns: Record<string,string> = { status:'status', progressPercent:'progress_percent', platformPostId:'platform_post_id', platformPostUrl:'platform_post_url', errorMessage:'error_message', retryCount:'retry_count', publishedAt:'published_at' };
    const entries = Object.entries(updates).filter(([key]) => columns[key]);
    await d1Query('UPDATE social_published_posts SET ' + [...entries.map(([key]) => columns[key] + ' = ?'), 'updated_at = ?'].join(', ') + ' WHERE id = ? AND user_id = ?', [...entries.map(([,v]) => v ?? null), now, recordId, row.user_id]);
    // Compute status in the database so concurrent platform completions cannot overwrite each other with stale state.
    await d1Query(`UPDATE social_publishing_jobs SET status = CASE
      WHEN NOT EXISTS (SELECT 1 FROM social_published_posts WHERE job_id = ? AND status != 'published') THEN 'completed'
      WHEN NOT EXISTS (SELECT 1 FROM social_published_posts WHERE job_id = ? AND status != 'failed') THEN 'failed'
      WHEN EXISTS (SELECT 1 FROM social_published_posts WHERE job_id = ? AND status IN ('pending','uploading','processing','publishing')) THEN 'in_progress'
      ELSE 'partial' END, updated_at = ? WHERE id = ? AND user_id = ?`, [row.job_id,row.job_id,row.job_id,now,row.job_id,row.user_id]);
    return true;
  }
  const store = readLocalSocialStore();
  const index = store.publishedPosts.findIndex(p => p.id === recordId);
  if (index < 0) return false;
  const record = store.publishedPosts[index] = { ...store.publishedPosts[index], ...updates, updatedAt: now };
  const job = store.publishingJobs.find(j => j.id === record.jobId);
  if (job) { job.status = overallStatus(store.publishedPosts.filter(p => p.jobId === job.id)); job.updatedAt = now; }
  writeLocalSocialStore(store);
  return true;
}

/** Atomically claim failed records; repeated clicks cannot publish the same record twice. */
export async function claimFailedPublishingRecord(recordId: string, userId: string): Promise<boolean> {
  const now = new Date().toISOString();
  if (getD1Status().configured) {
    const result = await d1Query('UPDATE social_published_posts SET status = ?, progress_percent = 0, retry_count = retry_count + 1, error_message = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND status = ?', ['pending', now, recordId, userId, 'failed']);
    return result.meta?.changes === 1;
  }
  const store = readLocalSocialStore();
  const record = store.publishedPosts.find(p => p.id === recordId && p.userId === userId && p.status === 'failed');
  if (!record) return false;
  record.status = 'pending'; record.progressPercent = 0; record.retryCount++; record.errorMessage = undefined; record.updatedAt = now;
  const job = store.publishingJobs.find(j => j.id === record.jobId);
  if (job) { job.status = 'queued'; job.updatedAt = now; }
  writeLocalSocialStore(store);
  return true;
}

export async function getPublishingHistory(userId: string, options?: { platform?: string; status?: string; limit?: number }): Promise<SocialPublishingJob[]> {
  const limit = Math.min(100, Math.max(1, options?.limit || 50));
  let jobs: SocialPublishingJob[];
  if (getD1Status().configured) {
    const params: (string | number)[] = [userId];
    let sql = 'SELECT * FROM social_publishing_jobs WHERE user_id = ?';
    if (options?.status) { sql += ' AND status = ?'; params.push(options.status); }
    if (options?.platform) { sql += ' AND EXISTS (SELECT 1 FROM social_published_posts p WHERE p.job_id = social_publishing_jobs.id AND p.platform = ?)'; params.push(options.platform); }
    sql += ' ORDER BY created_at DESC LIMIT ?'; params.push(limit);
    const rows = await d1Query<Record<string, any>>(sql, params);
    jobs = await Promise.all(rows.results.map(async row => {
      const posts = await d1Query<Record<string, any>>('SELECT * FROM social_published_posts WHERE job_id = ? AND user_id = ?', [row.id,userId]);
      return decodePublishingJob(row, posts.results.map(decodePublishedPost));
    }));
  } else {
    const store = readLocalSocialStore();
    jobs = store.publishingJobs.filter(j => j.userId === userId).map(j => ({ ...j, platforms: store.publishedPosts.filter(p => p.jobId === j.id && p.userId === userId) }));
    if (options?.platform) jobs = jobs.filter(j => j.platforms.some(p => p.platform === options.platform));
    if (options?.status) jobs = jobs.filter(j => j.status === options.status);
  }
  return jobs.slice(0,limit);
}

export async function claimPendingPublishingRecord(recordId: string, userId: string): Promise<boolean> {
  const now = new Date().toISOString();
  if (getD1Status().configured) {
    const result = await d1Query('UPDATE social_published_posts SET status = ?, progress_percent = 10, updated_at = ? WHERE id = ? AND user_id = ? AND status = ?', ['uploading',now,recordId,userId,'pending']);
    return result.meta?.changes === 1;
  }
  const store = readLocalSocialStore();
  const record = store.publishedPosts.find(p => p.id === recordId && p.userId === userId && p.status === 'pending');
  if (!record) return false;
  record.status = 'uploading'; record.progressPercent = 10; record.updatedAt = now;
  writeLocalSocialStore(store);
  return true;
}

/** Internal worker query. Never exposed to clients. */
export async function getRunnablePublishingJobs(): Promise<SocialPublishingJob[]> {
  if (getD1Status().configured) {
    const rows = await d1Query<{id:string}>("SELECT id FROM social_publishing_jobs WHERE status != 'preparing' AND EXISTS (SELECT 1 FROM social_published_posts p WHERE p.job_id = social_publishing_jobs.id AND p.status = ?) ORDER BY created_at ASC LIMIT 20", ['pending']);
    const jobs = await Promise.all(rows.results.map(row => getPublishingJob(row.id)));
    return jobs.filter((j): j is SocialPublishingJob => j !== null);
  }
  const store = readLocalSocialStore();
  return store.publishingJobs.filter(j => store.publishedPosts.some(p => p.jobId === j.id && p.status === 'pending')).slice(-20).map(j => ({...j, platforms: store.publishedPosts.filter(p => p.jobId === j.id)}));
}

/** Never automatically re-send a post that may already have reached a remote platform. */
export async function markInterruptedPublishingRecords(): Promise<void> {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  let records: PublishedPlatformRecord[];
  if (getD1Status().configured) {
    const rows = await d1Query<Record<string,any>>(`SELECT * FROM social_published_posts WHERE status IN ('uploading','processing','publishing') AND updated_at < ? AND EXISTS (SELECT 1 FROM social_publishing_jobs j WHERE j.id = job_id AND j.status != 'preparing')`, [cutoff]);
    records = rows.results.map(decodePublishedPost);
  } else {
    records = readLocalSocialStore().publishedPosts.filter(p => ['uploading','processing','publishing'].includes(p.status) && p.updatedAt < cutoff);
  }
  for (const record of records) await updatePublishedPlatformRecord(record.id, {status:'failed', errorMessage:'Publishing was interrupted. Check your platform account before retrying to avoid duplicate posts.'});
}
