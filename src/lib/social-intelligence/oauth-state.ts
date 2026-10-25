import { randomBytes, timingSafeEqual } from 'node:crypto';
import { PublishingPlatformKey } from './publishing-types';
import fs from 'node:fs';
import path from 'node:path';
import { APP_CONFIG } from '../config';

export const publishingPlatforms: PublishingPlatformKey[] = ['youtube', 'instagram', 'facebook', 'threads'];
export const oauthStateCookie = (platform: string) => `reelspark_publish_oauth_${platform}`;
export function safeOAuthReturnTo(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !/[\r\n\t]/.test(value)
    ? value : '/social-post?tab=accounts';
}
export function createOAuthState(userId: string, platform: PublishingPlatformKey, returnTo: string) {
  const state = randomBytes(32).toString('base64url');
  const directory = path.join(APP_CONFIG.storageRoot, '.oauth-states');
  fs.mkdirSync(directory, { recursive: true });
  for (const name of fs.readdirSync(directory)) {
    if (/^[A-Za-z0-9_-]{43}$/.test(name) && Date.now() - fs.statSync(path.join(directory, name)).mtimeMs > 600000) {
      try { fs.unlinkSync(path.join(directory, name)); } catch { /* Already consumed. */ }
    }
  }
  fs.writeFileSync(path.join(directory, state), userId, { flag: 'wx', mode: 0o600 });
  const cookie = Buffer.from(JSON.stringify({ state, userId, platform, returnTo: safeOAuthReturnTo(returnTo), createdAt: Date.now() })).toString('base64url');
  return { state, cookie };
}
export function consumeOAuthState(cookie: string | undefined, state: string | null, userId: string, platform: string) {
  if (!cookie || !state) throw new Error('Missing OAuth state. Please reconnect.');
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new Error('Invalid OAuth state.');
  const data = JSON.parse(Buffer.from(cookie, 'base64url').toString('utf8'));
  const a = Buffer.from(String(data.state || '')), b = Buffer.from(state);
  if (a.length !== b.length || !timingSafeEqual(a, b) || data.userId !== userId || data.platform !== platform ||
      !Number.isFinite(data.createdAt) || Date.now() - data.createdAt > 600000 || data.createdAt > Date.now()) {
    throw new Error('Invalid or expired OAuth state. Please reconnect.');
  }
  const file = path.join(APP_CONFIG.storageRoot, '.oauth-states', state);
  if (Date.now() - fs.statSync(file).mtimeMs > 600000) throw new Error('Expired OAuth state.');
  if (fs.readFileSync(file, 'utf8') !== userId) throw new Error('Invalid OAuth owner.');
  fs.unlinkSync(file);
  return safeOAuthReturnTo(data.returnTo);
}
