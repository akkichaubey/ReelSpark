import assert from 'node:assert/strict';
import { generateWithGemini, GeminiApiError } from '../src/lib/gemini';

async function main() {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const contents = [{ role: 'user', parts: [{ inlineData: { data: 'fixture', mimeType: 'audio/wav' } }] }];
  try {
    globalThis.fetch = async (_url, init) => {
      calls++;
      assert.deepEqual(JSON.parse(String(init?.body)).contents, contents);
      return calls === 1 ? new Response('Temporary upstream overload', { status: 503 })
        : Response.json({ candidates: [{ content: { parts: [{ text: 'recognized speech' }] } }] });
    };
    assert.equal(await generateWithGemini({ apiKey: 'fixture-key', contents }), 'recognized speech');
    assert.equal(calls, 2);
    calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({ error: { message: 'Invalid key' } }, { status: 401 }); };
    await assert.rejects(generateWithGemini({ apiKey: 'fixture-key', contents }), error => error instanceof GeminiApiError && error.status === 401);
    assert.equal(calls, 1, 'Authentication failures must not be retried');
    calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({ error: { message: 'Busy' } }, { status: 503 }); };
    await assert.rejects(generateWithGemini({ apiKey: 'fixture-key', contents }), error => error instanceof GeminiApiError && error.status === 503);
    assert.equal(calls, 3, 'Persistent overload must have bounded attempts');
    calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({ error: { message: 'Quota cooldown' } }, { status: 429, headers: { 'Retry-After': '120' } }); };
    await assert.rejects(generateWithGemini({ apiKey: 'fixture-key', contents }), GeminiApiError);
    assert.equal(calls, 1, 'Long cooldown must not cause an early retry');
    console.log('PASS: transient recovery, original audio payload, bounded overload retries, auth and quota cooldown');
  } finally { globalThis.fetch = originalFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
