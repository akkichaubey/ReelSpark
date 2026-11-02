import assert from 'node:assert/strict';
import { isSameOriginAuthRequest } from '../src/lib/auth';

const env = process.env as Record<string, string | undefined>;
const previous = { mode: env.NODE_ENV, origin: env.AUTH_URL };
function check(url: string, origin?: string, host?: string) {
  return isSameOriginAuthRequest(new Request(url, { headers: {
    ...(origin ? { origin } : {}), ...(host ? { host } : {}),
  } }));
}
try {
  env.NODE_ENV = 'development';
  env.AUTH_URL = 'https://reelspark.example.test';
  assert.equal(check('http://localhost:3002/api/auth/login', 'http://127.0.0.1:3002', '127.0.0.1:3002'), true);
  assert.equal(check('http://localhost:3002/api/auth/login', 'http://localhost:3002', 'localhost:3002'), true);
  assert.equal(check('http://localhost:3002/api/auth/login', 'http://[::1]:3002', '[::1]:3002'), true);
  assert.equal(check('http://localhost:3002/api/auth/login', 'https://evil.example', '127.0.0.1:3002'), false);
  assert.equal(check('http://localhost:3002/api/auth/login', 'http://localhost:3002', '127.0.0.1:3002'), false);
  assert.equal(check('http://localhost:3002/api/auth/login', 'http://127.0.0.1:3003', '127.0.0.1:3003'), false);
  for (const host of ['evil.example:3002', 'evil.example@127.0.0.1:3002', '127.0.0.1:3002/path', '127.0.0.1:3002#fragment']) {
    assert.equal(check('http://localhost:3002/api/auth/login', 'http://127.0.0.1:3002', host), false);
  }
  assert.equal(check('http://localhost:3002/api/auth/login', 'http://localhost:3002'), true, 'Legacy synthetic Request without Host is supported');
  assert.equal(check('http://localhost:3002/api/auth/login'), true, 'Non-browser requests keep the existing contract');
  env.NODE_ENV = 'production';
  assert.equal(check('https://reelspark.example.test/api/auth/login', 'https://reelspark.example.test'), true);
  assert.equal(check('https://reelspark.example.test/api/auth/login', 'http://127.0.0.1:3002', '127.0.0.1:3002'), false);
  assert.equal(check('http://localhost:3002/api/auth/login', 'http://127.0.0.1:3002', '127.0.0.1:3002'), false);
  env.AUTH_URL = 'http://127.0.0.1:3002';
  assert.equal(check('http://localhost:3002/api/auth/login', 'http://127.0.0.1:3002', '127.0.0.1:3002'), false, 'Production cannot use a loopback canonical origin');
  console.log('PASS: actual loopback Host in development, IPv6, port/origin mismatch, malformed Host, legacy requests and strict production canonical origin');
} finally {
  if (previous.mode === undefined) delete env.NODE_ENV; else env.NODE_ENV = previous.mode;
  if (previous.origin === undefined) delete env.AUTH_URL; else env.AUTH_URL = previous.origin;
}
