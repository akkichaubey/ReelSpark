/**
 * ReelSpark Intelligent Social Link Engine
 *
 * Deterministic link selection, target-platform exclusion, URL normalization,
 * and multi-account resolution.
 */

import { SocialAccount, SocialLinkPreferences, SocialPlatformKey } from './types';
import { ensureThreeDotsSpacing, hasThreeDotsPrefix } from './cta-presets';

export const PLATFORM_DOMAINS: Record<SocialPlatformKey, string[]> = {
  facebook: ['facebook.com', 'fb.com', 'fb.watch', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'],
  youtube: ['youtube.com', 'youtu.be', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'],
  instagram: ['instagram.com', 'www.instagram.com', 'm.instagram.com', 'instagr.am'],
  threads: ['threads.net', 'www.threads.net', 'threads.com', 'www.threads.com'],
  website: [], // Any valid web URL
};

/**
 * Normalizes account URLs: ensures https:// prefix, removes trailing slash and tracking params.
 */
export function normalizeSocialUrl(rawUrl: string, platform?: SocialPlatformKey): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim();

  // If user entered handle without URL (e.g. "@reelspark" or "reelspark")
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (url.startsWith('@')) {
      const handle = url.slice(1);
      switch (platform) {
        case 'instagram':
          return `https://instagram.com/${handle}`;
        case 'threads':
          return `https://threads.net/@${handle}`;
        case 'youtube':
          return `https://youtube.com/@${handle}`;
        case 'facebook':
          return `https://facebook.com/${handle}`;
        default:
          url = `https://${url}`;
      }
    } else if (url.includes('.com') || url.includes('.net') || url.includes('.org') || url.includes('.io') || url.includes('.ai')) {
      url = `https://${url}`;
    } else if (platform) {
      switch (platform) {
        case 'instagram':
          return `https://instagram.com/${url}`;
        case 'threads':
          return `https://threads.net/@${url}`;
        case 'youtube':
          return `https://youtube.com/@${url}`;
        case 'facebook':
          return `https://facebook.com/${url}`;
      }
    }
  }

  // Ensure https
  if (url.startsWith('http://')) {
    url = 'https://' + url.slice(7);
  }

  try {
    const parsed = new URL(url);

    // Canonicalize hostnames: strip www. and mobile/web prefixes, and normalize platform domains
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith('www.')) {
      host = host.slice(4);
    }
    if (host.startsWith('m.')) {
      host = host.slice(2);
    }
    if (host.startsWith('web.')) {
      host = host.slice(4);
    }

    if (host === 'threads.com') {
      host = 'threads.net';
    } else if (host === 'fb.com') {
      host = 'facebook.com';
    } else if (host === 'instagr.am') {
      host = 'instagram.com';
    }

    parsed.hostname = host;

    // Normalize path: strip trailing slashes (e.g. /truevoiceclub/ -> /truevoiceclub)
    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }

    // Platform-specific canonical path formatting
    if (platform === 'threads') {
      // Threads creator profile paths use /@handle
      if (parsed.pathname.length > 1 && !parsed.pathname.startsWith('/@')) {
        parsed.pathname = '/@' + parsed.pathname.slice(1);
      }
    } else if (platform === 'instagram' || platform === 'facebook') {
      // Instagram & Facebook creator profile paths do not use /@
      if (parsed.pathname.startsWith('/@')) {
        parsed.pathname = '/' + parsed.pathname.slice(2);
      }
    } else if (platform === 'youtube') {
      // YouTube creator handles use /@handle
      if (
        parsed.pathname.length > 1 &&
        !parsed.pathname.startsWith('/@') &&
        !parsed.pathname.startsWith('/channel/') &&
        !parsed.pathname.startsWith('/c/') &&
        !parsed.pathname.startsWith('/user/')
      ) {
        parsed.pathname = '/@' + parsed.pathname.slice(1);
      }
    }

    // Strip common tracking query params like utm_source, fbclid, igshid, si
    const searchParams = new URLSearchParams(parsed.search);
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'igshid', 'si'];
    trackingParams.forEach((p) => searchParams.delete(p));
    parsed.search = searchParams.toString();

    // Remove trailing slash if path is just /
    let clean = parsed.toString();
    if (clean.endsWith('/') && parsed.pathname === '/') {
      clean = clean.slice(0, -1);
    }
    return clean;
  } catch {
    return url;
  }
}

/**
 * Validates whether a URL matches the expected platform domain.
 */
export function validatePlatformUrl(url: string, platform: SocialPlatformKey): { valid: boolean; reason?: string } {
  const normalized = normalizeSocialUrl(url, platform);
  try {
    const parsed = new URL(normalized);

    // Website allows any valid HTTP/HTTPS domain
    if (platform === 'website') {
      if (!parsed.hostname || !parsed.hostname.includes('.')) {
        return { valid: false, reason: 'Invalid website domain' };
      }
      return { valid: true };
    }

    const allowedDomains = PLATFORM_DOMAINS[platform] || [];
    const hostname = parsed.hostname.toLowerCase();
    const isDomainMatch = allowedDomains.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`)
    );

    if (!isDomainMatch) {
      return {
        valid: false,
        reason: `URL domain "${hostname}" does not match expected platform (${allowedDomains.join(', ')})`,
      };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Malformed URL structure' };
  }
}

export interface ResolvedEligibleLink {
  account: SocialAccount;
  formattedText: string;
  isTargetPlatform: boolean;
}

/**
 * Resolves eligible social links for a specific content generation target.
 *
 * Deterministic Rules:
 * 1. Disabled accounts (enabled === false) are strictly excluded.
 * 2. Target platform's own link is excluded by default (unless excludeTargetPlatform === false).
 * 3. Multi-account handling: Pick explicitly selected account or primary account.
 * 4. Website inclusion controlled by includeWebsite preference.
 * 5. Other social profiles controlled by includeOtherSocials preference.
 * 6. Explicitly enabled IDs in eligibleAccountIds override.
 * 7. Deduplicate URLs.
 */
export function resolveEligibleSocialLinks(
  accounts: SocialAccount[],
  preferences: SocialLinkPreferences,
  targetPlatform: SocialPlatformKey | string,
  explicitSelectedAccountId?: string
): ResolvedEligibleLink[] {
  if (!accounts || accounts.length === 0) return [];

  const target = (targetPlatform || '').toLowerCase() as SocialPlatformKey;
  const normalizedAccounts = accounts.filter((acc) => acc.enabled !== false && acc.accountUrl);

  // Group accounts by platform to handle multi-account resolution
  const platformGroups = new Map<SocialPlatformKey, SocialAccount[]>();
  for (const acc of normalizedAccounts) {
    const list = platformGroups.get(acc.platform) || [];
    list.push(acc);
    platformGroups.set(acc.platform, list);
  }

  const chosenAccounts: SocialAccount[] = [];

  for (const [platform, group] of platformGroups.entries()) {
    // 1. If explicit account was selected for this platform
    const explicit = explicitSelectedAccountId
      ? group.find((a) => a.id === explicitSelectedAccountId)
      : undefined;

    if (explicit) {
      chosenAccounts.push(explicit);
      continue;
    }

    // 2. Otherwise pick primary account if configured
    const primary = group.find((a) => a.isPrimary);
    if (primary) {
      chosenAccounts.push(primary);
      continue;
    }

    // 3. Fallback to first configured account
    if (group[0]) {
      chosenAccounts.push(group[0]);
    }
  }

  // Filter based on preferences and target platform exclusion rules
  const eligible: ResolvedEligibleLink[] = [];
  const seenUrls = new Set<string>();

  for (const acc of chosenAccounts) {
    const isTarget = acc.platform === target;

    // Rule: Exclude target platform's own profile link by default
    if (isTarget && preferences.excludeTargetPlatform !== false) {
      continue;
    }

    // Rule: Filter website accounts
    if (acc.platform === 'website' && preferences.includeWebsite === false) {
      continue;
    }

    // Rule: Filter other social profiles
    if (acc.platform !== 'website' && !isTarget && preferences.includeOtherSocials === false) {
      continue;
    }

    // Rule: Explicit eligibleAccountIds filter (if specified and non-empty)
    if (
      Array.isArray(preferences.eligibleAccountIds) &&
      preferences.eligibleAccountIds.length > 0 &&
      !preferences.eligibleAccountIds.includes(acc.id)
    ) {
      continue;
    }

    // Deduplicate identical URLs
    const normUrl = normalizeSocialUrl(acc.accountUrl, acc.platform);
    if (seenUrls.has(normUrl.toLowerCase())) {
      continue;
    }
    seenUrls.add(normUrl.toLowerCase());

    const iconEmoji =
      acc.platform === 'youtube'
        ? '▶️ YouTube'
        : acc.platform === 'instagram'
        ? '📸 Instagram'
        : acc.platform === 'facebook'
        ? '📘 Facebook'
        : acc.platform === 'threads'
        ? '🧵 Threads'
        : '🌐 Website';

    const displayName = acc.displayName ? ` (${acc.displayName})` : '';
    const formattedText = `${iconEmoji}${displayName}: ${normUrl}`;

    eligible.push({
      account: { ...acc, accountUrl: normUrl },
      formattedText,
      isTargetPlatform: isTarget,
    });
  }

  // Sort according to user preference linkOrder if configured
  if (Array.isArray(preferences.linkOrder) && preferences.linkOrder.length > 0) {
    const orderMap = new Map<string, number>();
    preferences.linkOrder.forEach((key, index) => {
      orderMap.set(key.toLowerCase(), index);
    });

    eligible.sort((a, b) => {
      const orderA = orderMap.has(a.account.id)
        ? orderMap.get(a.account.id)!
        : orderMap.has(a.account.platform)
        ? orderMap.get(a.account.platform)!
        : 999;
      const orderB = orderMap.has(b.account.id)
        ? orderMap.get(b.account.id)!
        : orderMap.has(b.account.platform)
        ? orderMap.get(b.account.platform)!
        : 999;
      return orderA - orderB;
    });
  }

  return eligible;
}

/**
 * Formats a block of social links for insertion into post descriptions.
 */
export function formatSocialLinksBlock(
  eligibleLinks: ResolvedEligibleLink[],
  preferences: Partial<SocialLinkPreferences>
): string {
  if (!eligibleLinks || eligibleLinks.length === 0) return '';

  const rawHeading = (preferences.customHeading || '').trimEnd();
  // Strip any legacy embedded dots from heading text so heading text remains purely heading
  let headingText = rawHeading.replace(/^(\s*[.·•]\s*\n)+\s*/, '').trim();

  const shouldIncludeDots =
    preferences.threeDotsSpacer !== undefined
      ? preferences.threeDotsSpacer
      : hasThreeDotsPrefix(rawHeading);

  let heading = headingText;
  if (shouldIncludeDots) {
    heading = headingText ? `\n.\n.\n.\n\n${headingText}` : `\n.\n.\n.`;
  }

  const separateLines = preferences.displaySeparateLines !== false;
  const linkLines = eligibleLinks.map((l) => l.formattedText);

  if (separateLines) {
    const linksText = linkLines.join('\n');
    return heading ? `${heading}\n\n${linksText}` : linksText;
  } else {
    const linksText = linkLines.join(' • ');
    return heading ? `${heading}\n\n${linksText}` : linksText;
  }
}
