/**
 * AES-256-GCM Token Encryption Service
 *
 * Ensures OAuth access tokens and refresh tokens are never stored in plain text.
 */

import crypto from 'crypto';
import { publishingSecret } from './publishing-secret';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

function getLegacyMasterKey(): Buffer {
  const envKey = process.env.OAUTH_ENCRYPTION_KEY?.trim();
  if (envKey && envKey.length >= 32) {
    // Derive a fixed 32-byte key using SHA-256
    return crypto.createHash('sha256').update(envKey).digest();
  }

  // Resilient fallback for development / local testing
  const authSecret = process.env.AUTH_SECRET?.trim();
  if (process.env.NODE_ENV === 'production' && (!authSecret || authSecret.length < 32)) {
    throw new Error('Configure OAUTH_ENCRYPTION_KEY (at least 32 characters) before connecting publishing accounts.');
  }
  const fallbackSeed = authSecret || 'reelspark-secure-publishing-oauth-dev-key-2026';
  return crypto.createHash('sha256').update(fallbackSeed).digest();
}

/**
 * Encrypt a sensitive token string.
 * Format: v2:base64(iv + authTag + ciphertext). Legacy payloads remain readable.
 */
export function encryptToken(plainText: string): string {
  if (!plainText) return '';

  const key = crypto.createHash('sha256').update(publishingSecret()).digest();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, authTag, encrypted]);
  return `v2:${combined.toString('base64')}`;
}

/**
 * Decrypt an encrypted token string.
 */
export function decryptToken(cipherBase64: string): string {
  if (!cipherBase64) return '';

  try {
    const version2 = cipherBase64.startsWith('v2:');
    const combined = Buffer.from(version2 ? cipherBase64.slice(3) : cipherBase64, 'base64');
    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('Invalid encrypted token payload length');
    }

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const key = version2 ? crypto.createHash('sha256').update(publishingSecret()).digest() : getLegacyMasterKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err: any) {
    console.error('[Token Encryption] Decryption failed:', err.message);
    throw new Error('Failed to decrypt token');
  }
}
