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

interface LocalSocialStore {
  profiles: Record<string, ExtendedUserProfile>;
  accounts: SocialAccount[];
  preferences: Record<string, SocialLinkPreferences>;
}

function getLocalStoreFilePath(): string {
  return path.join(APP_CONFIG.storageRoot, 'social_intelligence_store.json');
}

function readLocalSocialStore(): LocalSocialStore {
  try {
    const file = getLocalStoreFilePath();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (err) {
    console.warn('[Social Intelligence] Failed to read local social store:', err);
  }
  return { profiles: {}, accounts: [], preferences: {} };
}

function writeLocalSocialStore(data: LocalSocialStore): void {
  try {
    const file = getLocalStoreFilePath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[Social Intelligence] Failed to write local social store:', err);
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
    name: 'ReelSpark Creator',
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
    name: updates.name || 'ReelSpark Creator',
    email: updates.email || '',
    preferences: {},
    updatedAt: new Date().toISOString(),
  };

  const updated: ExtendedUserProfile = {
    ...existing,
    ...updates,
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
  customHeading: '🔗 Connect with us:',
  displaySeparateLines: true,
  linkOrder: ['youtube', 'instagram', 'threads', 'facebook', 'website'],
  eligibleAccountIds: [],
  fixedHashtags: [
    { id: 'tag_1', tag: '#truevoiceclub', enabled: true },
    { id: 'tag_2', tag: '#reelspark', enabled: true },
  ],
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
