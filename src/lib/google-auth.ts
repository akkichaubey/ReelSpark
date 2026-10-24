import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export const GOOGLE_FLOW_COOKIE = 'reelspark_google_flow';
export const GOOGLE_FLOW_TTL = 10 * 60;
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 10000 });

export interface GoogleFlow {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  createdAt: number;
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function getAuthOrigin(requestUrl: string): string {
  const configured = process.env.AUTH_URL?.trim();
  const url = new URL(configured || requestUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new Error('AUTH_URL must use HTTPS, except on localhost.');
  }
  if (process.env.NODE_ENV === 'production' && (!configured || url.protocol !== 'https:')) {
    throw new Error('Set AUTH_URL to your public HTTPS origin.');
  }
  if (!configured && !local) throw new Error('Set AUTH_URL for a remote deployment.');
  return url.origin;
}

export function safeReturnTo(value: string | null | undefined, origin: string): string {
  if (!value?.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.pathname.startsWith('/api/')) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

export function startGoogleFlow(origin: string, returnTo: string) {
  const flow: GoogleFlow = {
    state: randomBytes(32).toString('base64url'),
    nonce: randomBytes(32).toString('base64url'),
    verifier: randomBytes(32).toString('base64url'),
    returnTo: safeReturnTo(returnTo, origin),
    createdAt: Date.now(),
  };
  const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorizationUrl.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: createHash('sha256').update(flow.verifier).digest('base64url'),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return { flow, authorizationUrl, cookieValue: Buffer.from(JSON.stringify(flow)).toString('base64url') };
}

export function readGoogleFlow(cookie: string | undefined, state: string | null): GoogleFlow | null {
  if (!cookie || cookie.length > 2048 || !state) return null;
  try {
    const flow = JSON.parse(Buffer.from(cookie, 'base64url').toString()) as GoogleFlow;
    if (![flow.state, flow.nonce, flow.verifier].every(value => typeof value === 'string' && /^[\w-]{43}$/.test(value))) return null;
    if (typeof flow.returnTo !== 'string' || !Number.isFinite(flow.createdAt)) return null;
    const age = Date.now() - flow.createdAt;
    if (age < -30000 || age > GOOGLE_FLOW_TTL * 1000) return null;
    const actual = Buffer.from(state);
    const expected = Buffer.from(flow.state);
    return actual.length === expected.length && timingSafeEqual(actual, expected) ? flow : null;
  } catch {
    return null;
  }
}

export async function verifyGoogleIdToken(token: string, nonce: string, clientId: string, keys: JWTVerifyGetKey = googleKeys) {
  const { payload } = await jwtVerify(token, keys, {
    algorithms: ['RS256'],
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: clientId,
    requiredClaims: ['sub', 'exp', 'iat', 'email', 'email_verified', 'nonce'],
    maxTokenAge: '1h',
    clockTolerance: 30,
  });
  if (payload.aud !== clientId || payload.nonce !== nonce || payload.email_verified !== true ||
      typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255 ||
      typeof payload.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    throw new Error('Invalid Google identity claims');
  }
  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim().slice(0, 120) : payload.email.split('@')[0],
  };
}

export async function exchangeGoogleCode(code: string, flow: GoogleFlow, origin: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
      redirect_uri: `${origin}/api/auth/google/callback`,
      grant_type: 'authorization_code',
      code_verifier: flow.verifier,
    }),
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Google code exchange failed');
  const tokens = await response.json();
  if (typeof tokens.id_token !== 'string') throw new Error('Google returned no identity token');
  return verifyGoogleIdToken(tokens.id_token, flow.nonce, process.env.GOOGLE_CLIENT_ID!.trim());
}
