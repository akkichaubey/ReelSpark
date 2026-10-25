/**
 * OAuth App Credentials Store
 *
 * Allows reading and setting developer credentials (Meta App ID, Google Client ID, etc.)
 * from both environment variables and local persisted configuration.
 */

import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from '../config';
import { PublishingPlatformKey } from './publishing-types';
import { encryptToken, decryptToken } from './token-encryption';
import { randomUUID } from 'node:crypto';

export interface PlatformOAuthSecrets {
  clientId?: string;
  clientSecret?: string;
}

export type OAuthSecretsConfig = Record<PublishingPlatformKey, PlatformOAuthSecrets>;

function getCredentialsFilePath(): string {
  return path.join(APP_CONFIG.storageRoot, 'oauth_credentials.json');
}

export function readStoredOAuthCredentials(): OAuthSecretsConfig {
  try {
    const file = getCredentialsFilePath();
    if (fs.existsSync(file)) {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8')) as OAuthSecretsConfig;
      for (const secrets of Object.values(stored)) {
        if (secrets.clientSecret?.startsWith('enc:v1:')) secrets.clientSecret = decryptToken(secrets.clientSecret.slice(7));
      }
      return stored;
    }
  } catch (err) {
    throw new Error('Unable to read saved OAuth credentials. Check the publishing encryption key.');
  }
  return {
    youtube: {},
    instagram: {},
    facebook: {},
    threads: {},
  };
}

export function saveStoredOAuthCredentials(
  platform: PublishingPlatformKey,
  secrets: PlatformOAuthSecrets
): OAuthSecretsConfig {
  const current = readStoredOAuthCredentials();
  current[platform] = {
    ...current[platform],
    ...secrets,
  };

  try {
    const file = getCredentialsFilePath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const encrypted = Object.fromEntries(Object.entries(current).map(([key, value]) => [key, {
      ...value, clientSecret: value.clientSecret ? `enc:v1:${encryptToken(value.clientSecret)}` : undefined,
    }]));
    const temporary = `${file}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(encrypted), { mode: 0o600 });
    fs.renameSync(temporary, file);
  } catch (err) {
    throw new Error('OAuth credentials could not be saved. Check server storage and encryption configuration.');
  }

  return current;
}

export function getResolvedOAuthCredentials(platform: PublishingPlatformKey): {
  clientId: string;
  clientSecret: string;
  isConfigured: boolean;
  source: 'env' | 'storage' | 'none';
} {
  const stored = readStoredOAuthCredentials()[platform] || {};

  switch (platform) {
    case 'youtube': {
      const envId = process.env.GOOGLE_CLIENT_ID?.trim();
      const envSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
      const clientId = envId || stored.clientId || '';
      const clientSecret = envSecret || stored.clientSecret || '';
      return {
        clientId,
        clientSecret,
        isConfigured: Boolean(clientId && clientSecret),
        source: envId ? 'env' : stored.clientId ? 'storage' : 'none',
      };
    }
    case 'instagram':
    case 'facebook': {
      const envId = process.env.META_APP_ID?.trim();
      const envSecret = process.env.META_APP_SECRET?.trim();
      const clientId = envId || stored.clientId || '';
      const clientSecret = envSecret || stored.clientSecret || '';
      return {
        clientId,
        clientSecret,
        isConfigured: Boolean(clientId && clientSecret),
        source: envId ? 'env' : stored.clientId ? 'storage' : 'none',
      };
    }
    case 'threads': {
      const envId = process.env.THREADS_APP_ID?.trim() || process.env.META_APP_ID?.trim();
      const envSecret = process.env.THREADS_APP_SECRET?.trim() || process.env.META_APP_SECRET?.trim();
      const clientId = envId || stored.clientId || '';
      const clientSecret = envSecret || stored.clientSecret || '';
      return {
        clientId,
        clientSecret,
        isConfigured: Boolean(clientId && clientSecret),
        source: envId ? 'env' : stored.clientId ? 'storage' : 'none',
      };
    }
    default:
      return { clientId: '', clientSecret: '', isConfigured: false, source: 'none' };
  }
}
