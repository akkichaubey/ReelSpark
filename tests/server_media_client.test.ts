import assert from 'node:assert/strict';
import { MediaServiceClient } from '../src/lib/clipping-studio/media-service-client';

async function main() {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      assert.ok(init?.signal, 'Requests must have a timeout signal');
      if (url.startsWith('https://media.example')) throw new Error('Offline');
      return Response.json({ success: true, metadata: { durationMs: 1000 } });
    };
    const client = new MediaServiceClient();
    assert.equal((await client.probeMedia('/server/media.mp4')).durationMs, 1000);
    assert.deepEqual(calls, ['/api/clipping-studio/probe']);

    calls.length = 0;
    const standalone = new MediaServiceClient({ serviceUrl: 'https://media.example' });
    await standalone.probeMedia('/server/media.mp4');
    assert.deepEqual(calls, ['https://media.example/api/probe', '/api/clipping-studio/probe']);

    globalThis.fetch = async () => Response.json({ success: true, metadata: {} }, { status: 500 });
    await assert.rejects(client.probeMedia('/server/media.mp4'), /Failed to probe/);
    globalThis.fetch = async () => Response.json({ status: 'invalid' });
    await assert.rejects(client.checkHealth());

    globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    await assert.rejects(new MediaServiceClient({ timeoutMs: 10 }).probeMedia('/server/media.mp4'), /aborted/);
    console.log('PASS: same-origin default, explicit standalone fallback, HTTP/schema errors and timeout');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
