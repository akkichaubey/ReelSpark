import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { APP_CONFIG } from '../config';
import { getD1Status } from '../cloudflare/d1';

/** A separate purpose-derived HMAC is used by callers; no public default secret. */
export function publishingSecret(): string {
  const key = process.env.OAUTH_ENCRYPTION_KEY?.trim();
  const authSecret = process.env.AUTH_SECRET?.trim();
  if (key) {
    if (key.length < 32) throw new Error('OAUTH_ENCRYPTION_KEY must contain at least 32 characters.');
    return key;
  }
  if (authSecret && authSecret.length >= 32) return authSecret;
  if (getD1Status().configured) throw new Error('Configure the same stable OAUTH_ENCRYPTION_KEY for environments sharing D1, or use separate local/live databases.');
  if (process.env.NODE_ENV === 'production') throw new Error('Configure OAUTH_ENCRYPTION_KEY (at least 32 characters) for secure publishing.');
  const file = path.join(APP_CONFIG.storageRoot, '.publishing-secret');
  fs.mkdirSync(APP_CONFIG.storageRoot, { recursive: true });
  try { fs.writeFileSync(file, randomBytes(48).toString('base64url'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  const value = fs.readFileSync(file, 'utf8').trim();
  if (value.length < 32) throw new Error('The local publishing key is invalid. Restore the original key before using saved accounts.');
  return value;
}
