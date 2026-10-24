/**
 * Authentication & User Management Service
 *
 * Built for Cloudflare D1 with local-first dev fallback.
 * Uses native Web Crypto API (crypto.subtle) with PBKDF2-SHA256:
 * - Zero external native dependencies
 * - Fully compatible with Cloudflare Workers / Pages Edge Runtime & Node.js
 */

import { d1Query, getD1Status } from './cloudflare/d1';
import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from './config';
import { createHash, randomBytes } from 'node:crypto';

export function isDemoLoginAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEMO_LOGIN === 'true';
}

export function isSameOriginAuthRequest(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try { return origin === new URL(process.env.AUTH_URL || req.url).origin; }
  catch { return false; }
}

export async function getRequestUser(req: Request): Promise<UserProfile | null> {
  const cookie = req.headers.get('cookie')?.match(/(?:^|;\s*)reelspark_session=([^;]+)/)?.[1];
  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = cookie || bearer;
  if (token) return validateSession(token);
  return isDemoLoginAllowed()
    ? { id: 'usr_admin', name: 'Administrator', email: 'admin@reelspark.ai', role: 'admin', createdAt: new Date().toISOString() }
    : null;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: string;
}

export interface AuthSession {
  token: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

// ─── Cryptographic Password Hashing (PBKDF2-SHA256 via Web Crypto) ─────────────

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export async function hashPassword(
  password: string,
  existingSalt?: string
): Promise<{ hash: string; salt: string }> {
  const enc = new TextEncoder();
  const saltBytes = existingSalt ? hexToBuffer(existingSalt) : crypto.getRandomValues(new Uint8Array(16));
  const salt = existingSalt || bufferToHex(saltBytes.buffer as ArrayBuffer);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const derivedKey = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const hash = bufferToHex(derivedKey);
  return { hash, salt };
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  salt: string
): Promise<boolean> {
  const { hash } = await hashPassword(password, salt);
  return hash === storedHash;
}

// ─── Local Fallback Store (for offline / dev when D1 is unconfigured) ─────────

interface LocalAuthStore {
  users: Array<{
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    salt: string;
    role: 'user' | 'admin';
    createdAt: string;
    updatedAt: string;
  }>;
  sessions: Array<{
    token: string;
    userId: string;
    expiresAt: string;
    createdAt: string;
  }>;
}

function getLocalAuthFilePath(): string {
  return path.join(APP_CONFIG.storageRoot, 'auth_store.json');
}

function readLocalAuthStore(): LocalAuthStore {
  try {
    const file = getLocalAuthFilePath();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (err) {
    console.warn('[Auth] Failed to read local auth store:', err);
  }
  return { users: [], sessions: [] };
}

function writeLocalAuthStore(data: LocalAuthStore): void {
  try {
    const file = getLocalAuthFilePath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[Auth] Failed to write local auth store:', err);
    throw new Error('Could not save authentication data');
  }
}

// ─── Core Authentication Methods ─────────────────────────────────────────────

/**
 * Register a new user account.
 */
export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ user?: UserProfile; error?: string }> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!name || name.length < 2) {
    return { error: 'Name must be at least 2 characters long' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return { error: 'Please enter a valid email address' };
  }

  if (!password || password.length < 6) {
    return { error: 'Password must be at least 6 characters long' };
  }

  const { hash, salt } = await hashPassword(password);
  const userId = `usr_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  const d1Status = getD1Status();

  if (d1Status.configured) {
    try {
      // Check duplicate
      const existing = await d1Query<{ id: string }>(
        'SELECT id FROM users WHERE email = ? LIMIT 1',
        [email]
      );
      if (existing.results.length > 0) {
        return { error: 'An account with this email already exists' };
      }

      await d1Query(
        `INSERT INTO users (id, name, email, password_hash, salt, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'user', ?, ?)`,
        [userId, name, email, hash, salt, now, now]
      );

      return {
        user: { id: userId, name, email, role: 'user', createdAt: now },
      };
    } catch (err: any) {
      console.error('[Auth D1 Register Error]', err);
      return { error: err.message || 'Registration failed' };
    }
  } else {
    // Local dev store
    const store = readLocalAuthStore();
    if (store.users.some((u) => u.email === email)) {
      return { error: 'An account with this email already exists' };
    }

    const newUser = {
      id: userId,
      name,
      email,
      passwordHash: hash,
      salt,
      role: 'user' as const,
      createdAt: now,
      updatedAt: now,
    };
    store.users.push(newUser);
    writeLocalAuthStore(store);

    return {
      user: { id: userId, name, email, role: 'user', createdAt: now },
    };
  }
}

/**
 * Log in an existing user with email and password.
 */
export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<{ user?: UserProfile; token?: string; error?: string }> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!email || !password) {
    return { error: 'Username/Email and password are required' };
  }

  const d1Status = getD1Status();

  // Instant demo login support for username 'admin' and password 'admin' (Development & Demo only)
  if (isDemoLoginAllowed() && (email === 'admin' || email === 'admin@reelspark.ai') && password === 'admin') {
    const adminUser: UserProfile = {
      id: 'usr_admin',
      name: 'Administrator',
      email: 'admin@reelspark.ai',
      role: 'admin',
      createdAt: new Date().toISOString(),
    };
    const token = `sess_admin_${crypto.randomUUID()}_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    if (d1Status.configured) {
      try {
        await d1Query(
          `INSERT OR IGNORE INTO users (id, name, email, password_hash, salt, role, created_at, updated_at)
           VALUES ('usr_admin', 'Administrator', 'admin@reelspark.ai', 'admin_preseed', 'salt_admin', 'admin', ?, ?)`,
          [now, now]
        );
        await d1Query(
          'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
          [token, 'usr_admin', expiresAt, now]
        );
      } catch (err: any) {
        console.warn('[Auth D1 Admin Warning]', err.message);
        return { error: 'Failed to create login session' };
      }
    } else {
      const store = readLocalAuthStore();
      if (!store.users.some((u) => u.id === 'usr_admin')) {
        store.users.push({
          id: 'usr_admin',
          name: 'Administrator',
          email: 'admin@reelspark.ai',
          passwordHash: 'admin_preseed',
          salt: 'salt_admin',
          role: 'admin',
          createdAt: now,
          updatedAt: now,
        });
      }
      store.sessions.push({ token, userId: 'usr_admin', expiresAt, createdAt: now });
      writeLocalAuthStore(store);
    }

    return { token, user: adminUser };
  }

  let userRow: {
    id: string;
    name: string;
    email: string;
    password_hash: string;
    salt: string;
    role: 'user' | 'admin';
    created_at: string;
  } | null = null;

  if (d1Status.configured) {
    try {
      const res = await d1Query<{
        id: string;
        name: string;
        email: string;
        password_hash: string;
        salt: string;
        role: 'user' | 'admin';
        created_at: string;
      }>('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
      userRow = res.results[0] || null;
    } catch (err: any) {
      console.error('[Auth D1 Login Error]', err);
      return { error: 'Database query failed during login' };
    }
  } else {
    const store = readLocalAuthStore();
    const local = store.users.find((u) => u.email === email);
    if (local) {
      userRow = {
        id: local.id,
        name: local.name,
        email: local.email,
        password_hash: local.passwordHash,
        salt: local.salt,
        role: local.role,
        created_at: local.createdAt,
      };
    }
  }

  if (!userRow) {
    return { error: 'Invalid email or password' };
  }

  if (!/^[a-f0-9]{64}$/i.test(userRow.password_hash) || !/^[a-f0-9]{32}$/i.test(userRow.salt)) {
    return { error: userRow.password_hash === '!google' ? 'Please use Continue with Google for this account.' : 'Invalid email or password' };
  }

  const isValid = await verifyPassword(password, userRow.password_hash, userRow.salt);
  if (!isValid) {
    return { error: 'Invalid email or password' };
  }

  let token: string;
  try { token = await createUserSession(userRow.id); }
  catch { return { error: 'Failed to create login session' }; }

  return {
    token,
    user: {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      role: userRow.role,
      createdAt: userRow.created_at,
    },
  };
}

async function createUserSession(userId: string): Promise<string> {
  const token = `sess_${crypto.randomUUID()}_${Date.now()}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  if (getD1Status().configured) {
    await d1Query(
      'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
      [token, userId, expiresAt, now]
    );
  } else {
    const store = readLocalAuthStore();
    store.sessions.push({ token, userId, expiresAt, createdAt: now });
    writeLocalAuthStore(store);
  }
  return token;
}

/** Called only with a Google identity verified server-side by the OAuth callback. */
export async function signInGoogleUser(identity: { sub: string; email: string; name: string }): Promise<{ user?: UserProfile; token?: string; error?: string }> {
  // The provider subject, not an email address, is the stable Google identity.
  const id = `usr_google_${createHash('sha256').update(identity.sub).digest('hex')}`;
  const now = new Date().toISOString();
  let user: UserProfile;
  try {
    if (getD1Status().configured) {
      const existing = await d1Query<{ id: string; name: string; email: string; role: 'user' | 'admin'; created_at: string }>(
        'SELECT id, name, email, role, created_at FROM users WHERE id = ? LIMIT 1', [id]
      );
      const row = existing.results[0];
      if (row) user = { id: row.id, name: row.name, email: row.email, role: row.role, createdAt: row.created_at };
      else {
        const collision = await d1Query('SELECT id FROM users WHERE email = ? LIMIT 1', [identity.email]);
        // Do not silently link a password account merely because its email matches.
        if (collision.results.length) return { error: 'google_account_exists' };
        await d1Query(
          `INSERT INTO users (id, name, email, password_hash, salt, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'user', ?, ?)`,
          [id, identity.name, identity.email, '!google', randomBytes(16).toString('hex'), now, now]
        );
        user = { id, name: identity.name, email: identity.email, role: 'user', createdAt: now };
      }
    } else {
      const store = readLocalAuthStore();
      const existing = store.users.find(row => row.id === id);
      if (existing) user = { id, name: existing.name, email: existing.email, role: existing.role, createdAt: existing.createdAt };
      else {
        if (store.users.some(row => row.email === identity.email)) return { error: 'google_account_exists' };
        user = { id, name: identity.name, email: identity.email, role: 'user', createdAt: now };
        store.users.push({ ...user, passwordHash: '!google', salt: randomBytes(16).toString('hex'), updatedAt: now });
        writeLocalAuthStore(store);
      }
    }
    return { user, token: await createUserSession(user.id) };
  } catch {
    // Never create a local fallback identity after a configured cloud database fails.
    return { error: 'google_storage_failed' };
  }
}

/**
 * Validate a session token and return the current user.
 */
export async function validateSession(token: string): Promise<UserProfile | null> {
  if (!token) return null;
  const d1Status = getD1Status();
  const now = new Date().toISOString();

  if (d1Status.configured) {
    try {
      const res = await d1Query<{
        id: string;
        name: string;
        email: string;
        role: 'user' | 'admin';
        created_at: string;
      }>(
        `SELECT u.id, u.name, u.email, u.role, u.created_at
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token = ? AND s.expires_at > ?
         LIMIT 1`,
        [token, now]
      );
      if (res.results.length === 0) return null;
      const u = res.results[0];
      if (u.id === 'usr_admin' && !isDemoLoginAllowed()) return null;
      return { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.created_at };
    } catch (err) {
      console.error('[Auth D1 Validate Session Error]', err);
      return null;
    }
  } else {
    const store = readLocalAuthStore();
    const session = store.sessions.find((s) => s.token === token && s.expiresAt > now);
    if (!session) return null;
    const local = store.users.find((u) => u.id === session.userId);
    if (!local) return null;
    if (local.id === 'usr_admin' && !isDemoLoginAllowed()) return null;
    return {
      id: local.id,
      name: local.name,
      email: local.email,
      role: local.role,
      createdAt: local.createdAt,
    };
  }
}

/**
 * Log out user by deleting their session token.
 */
export async function destroySession(token: string): Promise<boolean> {
  if (!token) return true;
  const d1Status = getD1Status();

  if (d1Status.configured) {
    try {
      await d1Query('DELETE FROM sessions WHERE token = ?', [token]);
      return true;
    } catch {
      return false;
    }
  } else {
    const store = readLocalAuthStore();
    store.sessions = store.sessions.filter((s) => s.token !== token);
    writeLocalAuthStore(store);
    return true;
  }
}
