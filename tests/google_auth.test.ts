import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { getAuthOrigin, safeReturnTo, startGoogleFlow, readGoogleFlow, verifyGoogleIdToken, GOOGLE_FLOW_COOKIE, GOOGLE_FLOW_TTL } from '../src/lib/google-auth';

async function run() {
  const previousEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const testStorage = mkdtempSync(path.join(os.tmpdir(), 'reelspark-google-auth-'));
  Object.assign(process.env, {
    NODE_ENV: 'development', AUTH_URL: 'http://localhost:3000',
    GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'test-secret',
    CLOUDFLARE_ACCOUNT_ID: 'test-account', CLOUDFLARE_D1_DATABASE_ID: 'test-db', CLOUDFLARE_API_TOKEN: 'test-token',
    ALLOW_DEMO_LOGIN: 'false', STORAGE_DIR: testStorage,
  });
  try {
    const auth = await import('../src/lib/auth');
    const start = await import('../src/app/api/auth/google/route');
    const callback = await import('../src/app/api/auth/google/callback/route');
    const me = await import('../src/app/api/auth/me/route');
    const logout = await import('../src/app/api/auth/logout/route');
    const login = await import('../src/app/api/auth/login/route');
    const register = await import('../src/app/api/auth/register/route');
    const providers = await import('../src/app/api/auth/providers/route');
    const accounts = await import('../src/app/api/social-accounts/route');
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const publicJwk = { ...await exportJWK(publicKey), kid: 'google-test-key', alg: 'RS256' };
    const localKeys = createLocalJWKSet({ keys: [publicJwk] });
    const users: Array<Record<string, string>> = [];
    const sessions: Array<Record<string, string>> = [];
    let idToken = '', expectedVerifier = '', tokenExchanges = 0, failDatabase = false;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [publicJwk] });
      if (url === 'https://oauth2.googleapis.com/token') {
        tokenExchanges++;
        const form = new URLSearchParams(String(init?.body));
        assert.equal(form.get('client_secret'), 'test-secret');
        assert.equal(form.get('code_verifier'), expectedVerifier);
        assert.equal(form.get('redirect_uri'), 'http://localhost:3000/api/auth/google/callback');
        return Response.json({ id_token: idToken });
      }
      assert.ok(url.startsWith('https://api.cloudflare.com/client/v4/'), 'No unexpected external requests');
      if (failDatabase) return Response.json({ error: 'Database unavailable' }, { status: 503 });
      const { sql, params = [] } = JSON.parse(String(init?.body));
      let results: Array<Record<string, string>> = [];
      if (sql.includes('JOIN users')) {
        const session = sessions.find(row => row.token === params[0] && row.expires_at > params[1]);
        results = session ? users.filter(row => row.id === session.user_id) : [];
      } else if (sql.startsWith('SELECT') && sql.includes('FROM users')) {
        results = users.filter(row => sql.includes('WHERE id =') ? row.id === params[0] : row.email === params[0]);
      } else if (sql.includes('INSERT INTO users')) {
        const [id, name, email, password_hash, salt, created_at] = params;
        assert.ok(!users.some(row => row.id === id || row.email === email));
        users.push({ id, name, email, password_hash, salt, role: 'user', created_at });
      } else if (sql.includes('INSERT INTO sessions')) {
        const [token, user_id, expires_at] = params;
        sessions.push({ token, user_id, expires_at });
      } else if (sql.includes('DELETE FROM sessions')) {
        const index = sessions.findIndex(row => row.token === params[0]);
        if (index !== -1) sessions.splice(index, 1);
      } else assert.fail(`Unexpected test query: ${sql}`);
      return Response.json({ success: true, result: [{ success: true, results }] });
    };
    const claims = { sub: 'google-subject-123', email: 'creator@example.com', email_verified: true, name: 'Test Creator' };
    const mint = (nonce: string, overrides: Record<string, unknown> = {}) => new SignJWT({ ...claims, nonce, ...overrides })
      .setProtectedHeader({ alg: 'RS256', kid: 'google-test-key' }).setIssuer('https://accounts.google.com')
      .setAudience(process.env.GOOGLE_CLIENT_ID!).setIssuedAt().setExpirationTime('5m').sign(privateKey);

    for (const next of ['//evil.example', '/\\evil.example', '/api/auth/google']) assert.equal(safeReturnTo(next, process.env.AUTH_URL!), '/');
    assert.equal(safeReturnTo('/social-post?tab=guidelines', process.env.AUTH_URL!), '/social-post?tab=guidelines');
    assert.equal(auth.isDemoLoginAllowed(), false);
    assert.equal(await auth.getRequestUser(new Request('http://localhost:3000')), null);
    assert.equal((await accounts.GET(new NextRequest('http://localhost:3000/api/social-accounts'))).status, 401);
    assert.ok((await auth.loginUser({ email: 'admin', password: 'admin' })).error);
    assert.equal((await login.POST(new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}',
    }))).status, 403);
    console.log('✓ Demo disabled, unauthenticated API/cross-origin login rejected, return paths restricted');

    let previousToken: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await start.GET(new NextRequest('http://localhost:3000/api/auth/google?next=%2Fsocial-post%3Ftab%3Dguidelines'));
      assert.equal(response.status, 303);
      const authorization = new URL(response.headers.get('location')!);
      assert.equal(authorization.origin, 'https://accounts.google.com');
      assert.equal(authorization.searchParams.get('scope'), 'openid email profile');
      assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
      assert.equal(authorization.searchParams.has('client_secret'), false);
      const cookie = response.cookies.get(GOOGLE_FLOW_COOKIE)!.value;
      const flow = readGoogleFlow(cookie, authorization.searchParams.get('state'))!;
      assert.ok(flow);
      assert.equal(readGoogleFlow(cookie, 'wrong-state'), null);
      const expired = Buffer.from(JSON.stringify({ ...flow, createdAt: Date.now() - (GOOGLE_FLOW_TTL + 1) * 1000 })).toString('base64url');
      assert.equal(readGoogleFlow(expired, flow.state), null);
      expectedVerifier = flow.verifier;
      idToken = await mint(flow.nonce);
      const cookies = `${GOOGLE_FLOW_COOKIE}=${cookie}${previousToken ? `; reelspark_session=${previousToken}` : ''}`;
      const result = await callback.GET(new NextRequest(`http://localhost:3000/api/auth/google/callback?code=auth-code&state=${flow.state}`, { headers: { cookie: cookies } }));
      assert.equal(result.headers.get('location'), 'http://localhost:3000/social-post?tab=guidelines');
      assert.equal(result.cookies.get(GOOGLE_FLOW_COOKIE)?.value, '');
      const session = result.cookies.get('reelspark_session');
      assert.ok(session?.value);
      assert.ok(result.headers.get('set-cookie')?.includes('HttpOnly'));
      assert.equal(users.length, 1, 'Returning Google identity reuses user');
      assert.equal(users[0].role, 'user', 'Google sign-in never grants admin');
      assert.equal(sessions.length, 1, 'Replacing a login revokes its prior session');
      previousToken = session.value;
      const current = await me.GET(new NextRequest('http://localhost:3000/api/auth/me', { headers: { cookie: `reelspark_session=${session.value}` } }));
      assert.equal((await current.json()).user.email, claims.email);
    }
    assert.equal(tokenExchanges, 2);
    console.log('✓ First/returning Google login, mocked D1 persistence, session rotation and current-user API');

    const transaction = startGoogleFlow(process.env.AUTH_URL!, '/social-post');
    const invalid = await callback.GET(new NextRequest('http://localhost:3000/api/auth/google/callback?code=bad&state=mismatch', { headers: { cookie: `${GOOGLE_FLOW_COOKIE}=${transaction.cookieValue}` } }));
    assert.ok(invalid.headers.get('location')?.includes('google_invalid_state'));
    assert.equal(tokenExchanges, 2, 'Reject invalid state before exchanging code');
    const cancelled = await callback.GET(new NextRequest(`http://localhost:3000/api/auth/google/callback?error=access_denied&state=${transaction.flow.state}`, { headers: { cookie: `${GOOGLE_FLOW_COOKIE}=${transaction.cookieValue}` } }));
    assert.ok(cancelled.headers.get('location')?.includes('google_cancelled'));
    for (const overrides of [{ email_verified: false }, { nonce: 'wrong' }]) {
      await assert.rejects(verifyGoogleIdToken(await mint(transaction.flow.nonce, overrides), transaction.flow.nonce, process.env.GOOGLE_CLIENT_ID!, localKeys));
    }
    await assert.rejects(verifyGoogleIdToken(await mint(transaction.flow.nonce), transaction.flow.nonce, 'another-client', localKeys));
    const expiredToken = await new SignJWT({ ...claims, nonce: transaction.flow.nonce }).setProtectedHeader({ alg: 'RS256', kid: 'google-test-key' })
      .setIssuer('https://accounts.google.com').setAudience(process.env.GOOGLE_CLIENT_ID!).setIssuedAt(1).setExpirationTime(2).sign(privateKey);
    await assert.rejects(verifyGoogleIdToken(expiredToken, transaction.flow.nonce, process.env.GOOGLE_CLIENT_ID!, localKeys));
    const forged = await new SignJWT({ ...claims, nonce: transaction.flow.nonce }).setProtectedHeader({ alg: 'RS256', kid: 'google-test-key' })
      .setIssuer('https://accounts.google.com').setAudience(process.env.GOOGLE_CLIENT_ID!).setIssuedAt().setExpirationTime('5m')
      .sign((await generateKeyPair('RS256')).privateKey);
    await assert.rejects(verifyGoogleIdToken(forged, transaction.flow.nonce, process.env.GOOGLE_CLIENT_ID!, localKeys));
    console.log('✓ Invalid/expired state, cancellation, wrong audience/nonce, unverified email, expired token and forged signature rejected');

    const registration = await register.POST(new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json', origin: process.env.AUTH_URL! },
      body: JSON.stringify({ name: 'Password User', email: 'password@example.com', password: 'TestPassword42!' }),
    }));
    assert.equal(registration.status, 200);
    assert.ok(registration.cookies.get('reelspark_session')?.value);
    assert.ok((await auth.loginUser({ email: 'password@example.com', password: 'TestPassword42!' })).token);
    assert.equal((await auth.signInGoogleUser({ sub: 'different-sub', email: 'password@example.com', name: 'Other' })).error, 'google_account_exists');
    assert.ok((await auth.loginUser({ email: claims.email, password: 'anything' })).error?.includes('Google'));
    const loggedOut = await logout.POST(new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'POST', headers: { cookie: `reelspark_session=${previousToken}`, origin: process.env.AUTH_URL! },
    }));
    assert.equal(loggedOut.status, 200);
    assert.equal(await auth.validateSession(previousToken!), null);
    console.log('✓ Password registration/login preserved, automatic account linking blocked, Google logout verified');

    failDatabase = true;
    assert.equal((await auth.signInGoogleUser({ sub: 'new-sub', email: 'new@example.com', name: 'New' })).error, 'google_storage_failed');
    assert.equal(existsSync(path.join(testStorage, 'auth_store.json')), false);
    failDatabase = false;
    process.env.GOOGLE_CLIENT_SECRET = '';
    assert.equal((await providers.GET().json()).google, false);
    assert.ok((await start.GET(new NextRequest('http://localhost:3000/api/auth/google?next=/social-post'))).headers.get('location')?.includes('google_not_configured'));
    Object.assign(process.env, { NODE_ENV: 'production', ALLOW_DEMO_LOGIN: 'true', AUTH_URL: 'https://reel.example' });
    assert.equal(auth.isDemoLoginAllowed(), false);
    assert.equal(getAuthOrigin('http://untrusted-host'), 'https://reel.example');
    process.env.AUTH_URL = '';
    assert.throws(() => getAuthOrigin('https://untrusted-host'));
    console.log('✓ Missing configuration/database failure handled; production origin pinned and demo disabled');
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
