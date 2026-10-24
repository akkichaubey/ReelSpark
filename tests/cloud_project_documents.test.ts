import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { NextRequest } from 'next/server';
import { APP_CONFIG } from '../src/lib/config';
import { saveClippingDocument, listClippingDocuments, deleteClippingDocument } from '../src/lib/cloudflare/project-documents';
import { createBlankClippingProject } from '../src/lib/clipping-studio/local-persistence';
import { GET, POST } from '../src/app/api/clipping-studio/projects/route';

async function main() {
  const require = createRequire(import.meta.url);
  const { DatabaseSync } = require('node:sqlite');
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys=ON; CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES (\'alice\'), (\'bob\'), (\'usr_admin\');');
  database.exec(await fs.readFile('src/lib/cloudflare/migrations/0001_project_documents.sql', 'utf8'));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reelspark-cloud-documents-'));
  const oldRoot = APP_CONFIG.storageRoot;
  const originalFetch = globalThis.fetch;
  const keys = ['CLOUD_PROJECT_METADATA_ENABLED', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN', 'ALLOW_DEMO_LOGIN'] as const;
  const oldEnv = new Map(keys.map(key => [key, process.env[key]]));
  APP_CONFIG.storageRoot = root;
  try {
    for (const key of keys) process.env[key] = key === 'CLOUD_PROJECT_METADATA_ENABLED' || key === 'ALLOW_DEMO_LOGIN' ? 'true' : 'fixture';
    globalThis.fetch = async (_input, init) => {
      const { sql, params } = JSON.parse(String(init?.body));
      const results = database.prepare(sql).all(...params);
      return Response.json({ success: true, result: [{ success: true, results }] });
    };
    const project = createBlankClippingProject('Private cloud project');
    await saveClippingDocument('alice', project);
    assert.equal((await listClippingDocuments('alice'))[0].name, project.name);
    assert.equal((await listClippingDocuments('bob')).length, 0);
    await assert.rejects(saveClippingDocument('bob', { ...project, name: 'Stolen' }), /ownership conflict/);
    await deleteClippingDocument('bob', project.id);
    assert.equal((await listClippingDocuments('alice')).length, 1);
    await deleteClippingDocument('alice', project.id);
    assert.equal((await listClippingDocuments('alice')).length, 0);

    const adminProject = createBlankClippingProject('Metadata only');
    const request = (method = 'GET', body?: unknown) => new NextRequest('http://localhost/api/clipping-studio/projects', {
      method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    assert.equal((await POST(request('POST', adminProject))).status, 200);
    const response = await (await GET(request())).json();
    assert.equal(response.projects[0].name, 'Metadata only');
    assert.equal(response.mediaDurable, false);
    globalThis.fetch = async () => { throw new Error('Simulated cloud failure'); };
    assert.equal((await GET(request())).status, 503);
    assert.equal((await POST(request('POST', adminProject))).status, 503);
    process.env.CLOUD_PROJECT_METADATA_ENABLED = 'false';
    assert.equal((await (await GET(request())).json()).enabled, false);
    assert.equal((await (await POST(request('POST', adminProject))).json()).synced, false);
    process.env.ALLOW_DEMO_LOGIN = 'false';
    assert.equal((await GET(request())).status, 401);
    assert.equal((await POST(request('POST', adminProject))).status, 401);
    console.log('PASS: additive migration in SQLite, real tenant SQL isolation/conflicts/deletion, metadata API, disabled mode and fail-closed cloud errors');
  } finally {
    database.close();
    APP_CONFIG.storageRoot = oldRoot;
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      const value = oldEnv.get(key);
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
