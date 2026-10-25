import crypto from 'node:crypto';
import { publishingSecret } from './publishing-secret';

export interface PresignedMediaUrlResult { url: string; isPublic: boolean; expiresAt: string; }
const lifetime = 2 * 60 * 60 * 1000;
function signature(userId: string, storagePath: string, expires: string) {
  return crypto.createHmac('sha256', publishingSecret()).update(JSON.stringify(['media-ingest-v1', userId, storagePath, expires])).digest('hex');
}
export function getPresignedVideoUrl(storagePath: string, origin: string, userId: string): PresignedMediaUrlResult {
  const normalized = storagePath.replace(/\\/g, '/');
  const expires = String(Date.now() + lifetime);
  const url = new URL('/api/files/' + normalized.split('/').map(encodeURIComponent).join('/'), origin);
  url.searchParams.set('ingest_token', signature(userId, normalized, expires));
  url.searchParams.set('expires', expires);
  url.searchParams.set('uid', userId);
  return { url: url.toString(), isPublic: false, expiresAt: new Date(Number(expires)).toISOString() };
}
export function verifyMediaIngest(url: URL, relativePath: string): string | null {
  const uid = url.searchParams.get('uid'), token = url.searchParams.get('ingest_token'), expires = url.searchParams.get('expires');
  if (!uid || !token || !expires || !/^\d+$/.test(expires) || !/^[a-f0-9]{64}$/.test(token)) return null;
  const remaining = Number(expires) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > lifetime) return null;
  const expected = signature(uid, relativePath, expires);
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected)) ? uid : null;
}
