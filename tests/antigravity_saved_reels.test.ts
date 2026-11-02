import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { NextRequest } from 'next/server';
import { APP_CONFIG } from '../src/lib/config';
import { saveAnalysisCandidate } from '../src/lib/saved-reels/analysis-client';
import { createEmptyCaptionProject } from '../src/lib/caption-maker/sample-data';
import { listSavedReelsPage } from '../src/lib/saved-reels/storage';
import { getProjectDirs, loadProject } from '../src/lib/storage';
import { PATCH, DELETE } from '../src/app/api/projects/[id]/route';
import type { ClipCandidate, Project } from '../src/lib/types';

async function main() {
  const source = {
    id: 'review_source',
    title: 'Source',
    localVideoPath: '/managed/source.mp4',
    transcript: [],
    videoMetadata: { width: 640, height: 360 },
  } as unknown as Project;
  const candidate = {
    id: 'a',
    title: 'Edited title',
    start: 1.234,
    end: 5.678,
    duration: 4.444,
    transcript: 'Actual source words',
  } as ClipCandidate;
  const audio = {
    id: 'voice',
    fileUrl: '/api/files/caption-maker/asset_fixture/voice.mp3',
    fileName: 'voice.mp3',
    fileSize: 100,
    duration: 4.444,
    format: 'MP3',
  };
  const video = {
    id: 'video',
    fileUrl: '/api/files/caption-maker/asset_fixture/video.mp4',
    fileName: 'video.mp4',
    fileSize: 200,
    width: 640,
    height: 360,
    mediaType: 'video',
    format: 'MP4',
    duration: 4.444,
  };
  let savedPayload: Record<string, any> = {};
  let requests = 0;
  const transport: typeof fetch = async (url, init) => {
    requests++;
    const body = JSON.parse(String(init?.body));
    if (String(url).includes('bridge-caption')) {
      assert.equal(body.startMs, 1234);
      assert.equal(body.endMs, 5678);
      assert.equal(body.sourceProjectId, source.id);
      assert.equal(body.hasVideo, true);
      return Response.json({ success: true, audio, video });
    }
    savedPayload = body;
    return Response.json({
      success: true,
      reel: { id: 'saved_fixture', project: body.project },
    });
  };
  await saveAnalysisCandidate(source, candidate, 'en', transport);
  assert.equal(requests, 2);
  assert.equal(
    savedPayload.project.image.fileUrl,
    video.fileUrl,
    'AI candidates retain their sliced video, not just spoken audio'
  );
  assert.equal(savedPayload.project.image.muteSourceAudio, true);
  assert.equal(savedPayload.project.audio.fileUrl, audio.fileUrl);
  assert.equal(savedPayload.project.audio.duration, 4.444);
  assert.ok(!JSON.stringify(savedPayload).includes('/sample-audio.mp3'));
  let failureRequests = 0;
  await assert.rejects(
    saveAnalysisCandidate(source, candidate, 'en', async () => {
      failureRequests++;
      return Response.json(
        { success: false, error: 'Source unavailable' },
        { status: 404 }
      );
    }),
    /Source unavailable/
  );
  assert.equal(
    failureRequests,
    1,
    'Failed preparation must never create a saved reel with fallback media'
  );
  await saveAnalysisCandidate(
    source,
    { ...candidate, start: 1.234, end: 2.734, duration: 1.5 },
    'en',
    async (url, init) => {
      const body = JSON.parse(String(init?.body));
      if (String(url).includes('bridge-caption'))
        return Response.json({
          success: true,
          audio: { ...audio, duration: 1.5 },
          video: { ...video, duration: 1.5 },
        });
      assert.equal(body.project.audio.duration, 1.5);
      assert.ok(
        body.project.transcript.every(
          (word: { end: number }) => word.end <= 1.5
        ),
        'Short clips must not expand caption timings to three seconds'
      );
      return Response.json({
        success: true,
        reel: { id: 'saved_short', project: body.project },
      });
    }
  );
  await assert.rejects(
    saveAnalysisCandidate(source, candidate, 'en', async () =>
      Response.json({ success: true, audio })
    ),
    /video could not be prepared/
  );
  await assert.rejects(
    saveAnalysisCandidate(source, candidate, 'en', async (url) =>
      String(url).includes('bridge-caption')
        ? Response.json({ success: true, audio, video })
        : Response.json(
            { success: false, error: 'Storage offline' },
            { status: 503 }
          )
    ),
    /Storage offline/
  );
  console.log(
    'PASS: AI save includes real video/audio, preserves edited boundaries, and propagates failures without sample fallbacks'
  );

  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'reelspark-review-regression-')
  );
  const oldConfig = { ...APP_CONFIG };
  const oldFetch = globalThis.fetch;
  const keys = [
    'ALLOW_DEMO_LOGIN',
    'CLOUD_PRIVATE_MEDIA_ENABLED',
    'CLOUD_PROJECT_METADATA_ENABLED',
    'CLOUD_MEDIA_LIFECYCLE_ENABLED',
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_D1_DATABASE_ID',
    'CLOUDFLARE_API_TOKEN',
  ];
  const environment = new Map(keys.map((key) => [key, process.env[key]]));
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
  const db = new DatabaseSync(':memory:');
  try {
    Object.assign(APP_CONFIG, {
      storageRoot: root,
      projectsDir: path.join(root, 'projects'),
      tempDir: path.join(root, 'temp'),
    });
    process.env.ALLOW_DEMO_LOGIN = 'true';
    for (const key of [
      'CLOUD_PRIVATE_MEDIA_ENABLED',
      'CLOUD_PROJECT_METADATA_ENABLED',
      'CLOUD_MEDIA_LIFECYCLE_ENABLED',
    ])
      process.env[key] = 'false';
    const directories = getProjectDirs('review_fixture');
    await fs.writeFile(
      directories.manifestFile,
      JSON.stringify({
        id: 'review_fixture',
        ownerUserId: 'usr_admin',
        title: 'Fixture',
        transcript: [],
        candidates: [
          { id: 'a', title: 'A', start: 0, end: 5, duration: 5 },
          { id: 'b', title: 'B', start: 5, end: 10, duration: 5 },
        ],
      })
    );
    const patch = (mutation: unknown) =>
      PATCH(
        new NextRequest('http://localhost/api/projects/review_fixture', {
          method: 'PATCH',
          headers: {
            origin: 'http://localhost',
            'content-type': 'application/json',
          },
          body: JSON.stringify(mutation),
        }),
        { params: Promise.resolve({ id: 'review_fixture' }) }
      );
    const writes = await Promise.all([
      patch({
        candidateUpdate: { id: 'a', changes: { savedReelId: 'saved_a' } },
      }),
      patch({
        candidateUpdate: { id: 'b', changes: { savedReelId: 'saved_b' } },
      }),
    ]);
    for (const response of writes)
      assert.equal(response.status, 200, await response.clone().text());
    let project = await loadProject('review_fixture');
    assert.equal(project?.candidates[0].savedReelId, 'saved_a');
    assert.equal(project?.candidates[1].savedReelId, 'saved_b');
    await patch({ candidateUpdate: { id: 'a', changes: { title: 'Edited' } } });
    project = await loadProject('review_fixture');
    assert.equal(project?.candidates[0].savedReelId, 'saved_a');
    assert.equal(
      (
        await patch({
          candidateUpdate: { id: 'missing', changes: { title: 'Invalid' } },
        })
      ).status,
      404
    );
    await patch({ deleteCandidateId: 'a' });
    project = await loadProject('review_fixture');
    assert.equal(project?.candidates.length, 1);
    assert.equal(project?.candidates[0].savedReelId, 'saved_b');
    await Promise.all([
      patch({ candidateUpdate: { id: 'b', changes: { title: 'Final edit' } } }),
      DELETE(new NextRequest('http://localhost/api/projects/review_fixture', { method: 'DELETE', headers: { origin: 'http://localhost' } }), { params: Promise.resolve({ id: 'review_fixture' }) }),
    ]);
    assert.equal(await loadProject('review_fixture'), null, 'A queued clip update cannot resurrect a deleted project');
    console.log(
      'PASS: concurrent candidate saves retain both saved-reel links, edits preserve markers, and per-clip deletion preserves other clips'
    );

    db.exec(
      "CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES ('usr_admin'), ('bob');"
    );
    db.exec(
      await fs.readFile(
        'src/lib/cloudflare/migrations/0001_project_documents.sql',
        'utf8'
      )
    );
    process.env.CLOUD_PRIVATE_MEDIA_ENABLED = 'true';
    for (const key of [
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_D1_DATABASE_ID',
      'CLOUDFLARE_API_TOKEN',
    ])
      process.env[key] = 'fixture';
    globalThis.fetch = async (_url, init) => {
      const { sql, params } = JSON.parse(String(init?.body));
      return Response.json({
        success: true,
        result: [{ success: true, results: db.prepare(sql).all(...params) }],
      });
    };
    const insert = db.prepare(
      "INSERT INTO project_documents(kind,id,owner_user_id,payload,updated_at) VALUES ('saved-reel',?,?,?,?)"
    );
    for (let index = 0; index < 26; index++) {
      const id = `saved_page_${String(index).padStart(2, '0')}`;
      const project = createEmptyCaptionProject();
      project.title =
        index === 0
          ? 'Literal %_ title'
          : `Reel ${String(index).padStart(2, '0')}`;
      insert.run(
        id,
        'usr_admin',
        JSON.stringify({
          id,
          title: project.title,
          project,
          revision: 1,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        }),
        project.updatedAt
      );
    }
    const options = { page: 0, query: '', sort: 'name', filter: 'all' };
    const firstPage = await listSavedReelsPage('usr_admin', options);
    const secondPage = await listSavedReelsPage('usr_admin', {
      ...options,
      page: 1,
    });
    assert.equal(firstPage.reels.length, 24);
    assert.equal(firstPage.hasMore, true);
    assert.equal(secondPage.reels.length, 2);
    assert.equal(secondPage.hasMore, false);
    assert.equal(
      new Set([...firstPage.reels, ...secondPage.reels].map((reel) => reel.id))
        .size,
      26
    );
    assert.equal(
      (await listSavedReelsPage('usr_admin', { ...options, query: '%_' })).reels
        .length,
      1,
      'Search treats wildcard characters literally'
    );
    assert.equal((await listSavedReelsPage('bob', options)).reels.length, 0);
    assert.equal(
      (
        await listSavedReelsPage('usr_admin', {
          ...options,
          filter: 'captions',
        })
      ).reels.length,
      0
    );
    console.log(
      'PASS: real SQLite pagination, deterministic page boundaries, literal wildcard search and ownership filtering'
    );
  } finally {
    Object.assign(APP_CONFIG, oldConfig);
    globalThis.fetch = oldFetch;
    db.close();
    for (const [key, value] of environment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    assert.ok(
      path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)
    );
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
