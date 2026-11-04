import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { NextRequest } from 'next/server';
import { APP_CONFIG, getFfmpegPath } from '../src/lib/config';
import { createEmptyCaptionProject } from '../src/lib/caption-maker/sample-data';
import { groupTranscriptWords } from '../src/lib/caption-maker/caption-grouping';
import { canReadMedia } from '../src/lib/media-access';
import { deleteProject, getProjectDirs } from '../src/lib/storage';
import { probeVideo } from '../src/lib/ffmpeg';
import {
  loadStorageReferenceSnapshot,
  saveStorageReferences,
} from '../src/lib/storage-references';
import { runStorageMaintenance } from '../src/lib/storage-maintenance';
import {
  saveSavedReel,
  listSavedReels,
  getSavedReel,
  deleteSavedReel,
  savedReelMediaReferences,
  type SavedMediaServices,
} from '../src/lib/saved-reels/storage';
import {
  backupPrivateMedia,
  restorePrivateMedia,
  hasPrivateMediaBackup,
} from '../src/lib/cloudflare/private-media';
import { POST as bridge } from '../src/app/api/clipping-studio/bridge-caption/route';
import {
  GET as libraryGet,
  POST as librarySave,
} from '../src/app/api/saved-reels/route';
import { reelDuration } from '../src/lib/saved-reels/types';
import type { CaptionProject } from '../src/lib/caption-maker/types';
import { renderReelVideo } from '../src/lib/caption-maker/ffmpeg-renderer';
import { POST as renderVideo } from '../src/app/api/caption-maker/render/route';
import { trimCaptionTiming } from '../src/lib/caption-maker/render-trim';
import { deleteOwnedClippingProjectDirect } from '../src/lib/cloudflare/media-lifecycle';
import { recordMediaOwner } from '../src/lib/media-access';
import { clippingProjectDeleted } from '../src/lib/cloudflare/media-lifecycle-state';

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reelspark-saved-'));
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
  ] as const;
  const previousEnv = new Map(keys.map((key) => [key, process.env[key]]));
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
  const db = new DatabaseSync(':memory:');
  try {
    Object.assign(APP_CONFIG, {
      storageRoot: root,
      projectsDir: path.join(root, 'projects'),
      tempDir: path.join(root, 'temp'),
    });
    process.env.ALLOW_DEMO_LOGIN = 'true';
    process.env.CLOUD_PRIVATE_MEDIA_ENABLED = 'false';
    process.env.CLOUD_PROJECT_METADATA_ENABLED = 'false';
    process.env.CLOUD_MEDIA_LIFECYCLE_ENABLED = 'false';
    const dirs = getProjectDirs('proj_fixture');
    const original = path.join(dirs.originalDir, 'source.mp4');
    execFileSync(
      getFfmpegPath(),
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=320x240:duration=4',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=4',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        '-y',
        original,
      ],
      { windowsHide: true }
    );
    const manifest = {
      id: 'proj_fixture',
      ownerUserId: 'usr_admin',
      title: 'Original long video',
      localVideoPath: original,
      transcript: [
        { id: 'seg', start: 0.5, end: 2.4, text: 'Actual spoken words' },
      ],
      candidates: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(dirs.manifestFile, JSON.stringify(manifest));
    const requestBridge = (startMs: number, endMs: number) =>
      bridge(
        new NextRequest('http://localhost/api/clipping-studio/bridge-caption', {
          method: 'POST',
          headers: {
            origin: 'http://localhost',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            clipId: 'same_clip',
            clipName: 'Good clip',
            sourcePath: original,
            sourceProjectId: manifest.id,
            startMs,
            endMs,
            hasVideo: true,
          }),
        })
      );
    const firstResponse = await requestBridge(500, 2500);
    assert.equal(firstResponse.status, 200, await firstResponse.clone().text());
    const first = await firstResponse.json();
    const second = await (await requestBridge(1500, 3500)).json();
    assert.notEqual(
      first.audio.fileUrl,
      second.audio.fileUrl,
      'Editing clip bounds never overwrites a prior bridge export'
    );
    assert.equal(first.video.width, 320);
    assert.equal(first.video.height, 240);
    assert.equal(first.syncedSegments[0].start, 0);
    assert.ok(first.syncedSegments[0].end <= 2);
    assert.equal((await requestBridge(-1, 1000)).status, 400);
    assert.equal((await requestBridge(3000, 9000)).status, 400);
    const project: CaptionProject = {
      ...createEmptyCaptionProject(),
      title: 'Saved favorite',
      thumbnailCover: { enabled: true, customBgUrl: 'data:image/png;base64,iVBORw0KGgo=' },
      image: first.video,
      audio: first.audio,
      transcript: [
        {
          id: 'manual1',
          text: 'Manually',
          start: 0.213,
          end: 0.654,
          isImportant: true,
        },
        { id: 'manual2', text: 'edited', start: 0.81, end: 1.91 },
      ],
      trimRange: { start: 0.1, end: 1.95 },
      isAudioSynced: true,
      syncVersion: 5,
    };
    project.captionGroups = groupTranscriptWords(project.transcript, 4);
    project.captionStyle = { ...project.captionStyle, fontSize: 47 };
    const saved = await saveSavedReel(
      'usr_admin',
      project,
      'http://localhost',
      { originProjectId: manifest.id, originProjectName: manifest.title }
    );
    assert.ok(saved.project.image?.fileUrl.includes('asset_saved_'));
    assert.deepEqual(saved.project.transcript, project.transcript);
    assert.deepEqual(saved.project.captionGroups, project.captionGroups);
    assert.deepEqual(saved.project.captionStyle, project.captionStyle);
    assert.deepEqual(saved.project.outputSettings, project.outputSettings);
    assert.deepEqual(saved.project.thumbnailCover, project.thumbnailCover);
    assert.deepEqual((await getSavedReel('usr_admin', saved.id))?.project.thumbnailCover, project.thumbnailCover);
    assert.deepEqual(saved.project.trimRange, project.trimRange);
    assert.equal(reelDuration(saved.project), 1.8499999999999999);
    assert.equal((await listSavedReels('bob')).length, 0);
    await assert.rejects(
      saveSavedReel('bob', project, 'http://localhost'),
      /unavailable to this account/
    );
    await assert.rejects(
      saveSavedReel('bob', project, 'http://localhost', {
        id: saved.id,
        revision: saved.revision,
      }),
      /not found/
    );
    const copy = await saveSavedReel(
      'usr_admin',
      { ...saved.project, title: 'Independent copy' },
      'http://localhost'
    );
    assert.equal(
      copy.project.image?.fileUrl,
      saved.project.image?.fileUrl,
      'Reel copies share immutable retained video'
    );
    assert.notEqual(copy.id, saved.id);
    assert.equal(
      await deleteProject(manifest.id),
      true,
      'Original project can be deleted after saving favorites'
    );
    const retainedVideo = path.join(
      root,
      decodeURIComponent(saved.project.image!.fileUrl.slice(11))
    );
    assert.equal(await canReadMedia('usr_admin', retainedVideo), true);
    assert.equal(await canReadMedia('bob', retainedVideo), false);
    const metadata = await probeVideo(retainedVideo);
    assert.ok(Math.abs(metadata.duration - 2) < 0.1);
    assert.equal(metadata.hasAudio, true);
    const exported = path.join(root, 'qa-final-export.mp4');
    await renderReelVideo({
      imagePath: retainedVideo,
      audioPath: path.join(
        root,
        decodeURIComponent(saved.project.audio!.fileUrl.slice(11))
      ),
      outputPath: exported,
      groups: saved.project.captionGroups,
      words: saved.project.transcript,
      style: saved.project.captionStyle,
      outputSettings: {
        ...saved.project.outputSettings,
        width: 640,
        height: 360,
        fps: 30,
        aspectRatio: '16:9',
      },
      mediaType: 'video',
    });
    const finalMetadata = await probeVideo(exported);
    assert.equal(finalMetadata.width, 640);
    assert.equal(finalMetadata.height, 360);
    assert.equal(finalMetadata.hasAudio, true);
    assert.ok(Math.abs(finalMetadata.duration - 2) < 0.15);
    const beforeTrim = structuredClone(saved.project.transcript);
    const timing = trimCaptionTiming(
      saved.project.transcript,
      saved.project.captionGroups,
      { start: 0.5, end: 1.5 }
    );
    assert.equal(timing.words[0].id, 'manual1');
    assert.equal(timing.words[0].start, 0);
    assert.equal(timing.words[0].isImportant, true);
    assert.deepEqual(
      saved.project.transcript,
      beforeTrim,
      'Export trim must not alter saved manual timings'
    );
    const renderResponse = await renderVideo(
      new NextRequest('http://localhost/api/caption-maker/render', {
        method: 'POST',
        headers: {
          origin: 'http://localhost',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          projectId: 'qa_saved_trim',
          image: saved.project.image,
          audio: saved.project.audio,
          transcript: saved.project.transcript,
          captionGroups: saved.project.captionGroups,
          captionStyle: saved.project.captionStyle,
          trimRange: { start: 0.5, end: 1.5 },
          outputSettings: {
            ...saved.project.outputSettings,
            width: 640,
            height: 360,
            fps: 30,
            aspectRatio: '16:9',
          },
          mergeThumbnail: false,
        }),
      })
    );
    assert.equal(
      renderResponse.status,
      200,
      await renderResponse.clone().text()
    );
    const renderData = await renderResponse.json();
    const renderedTrim = await probeVideo(renderData.videoPath);
    assert.ok(
      Math.abs(renderedTrim.duration - 1) < 0.12,
      'Actual API final export matches selected trim'
    );
    assert.equal(renderedTrim.hasAudio, true);
    assert.match(await fs.readFile(renderData.srtPath, 'utf8'), /00:00:00,000/);
    assert.deepEqual(
      (await getSavedReel('usr_admin', saved.id))?.project.transcript,
      project.transcript,
      'Re-read persisted state without browser cache'
    );
    const changed = await saveSavedReel(
      'usr_admin',
      { ...saved.project, title: 'Updated same reel' },
      'http://localhost',
      { id: saved.id, revision: saved.revision }
    );
    assert.equal(changed.id, saved.id);
    assert.equal(changed.revision, 2);
    assert.equal((await listSavedReels('usr_admin')).length, 2);
    await assert.rejects(
      saveSavedReel('usr_admin', saved.project, 'http://localhost', {
        id: saved.id,
        revision: 1,
      }),
      /another window/
    );
    assert.equal(
      (await getSavedReel('usr_admin', copy.id))?.title,
      'Independent copy'
    );
    const refs = await savedReelMediaReferences();
    assert.ok(
      refs.includes(decodeURIComponent(saved.project.image!.fileUrl.slice(11)))
    );
    await saveStorageReferences('usr_admin', 'fixture', [], {}, true);
    const past = new Date(Date.now() - 40 * 86400000);
    for (const asset of [saved.project.image!, saved.project.audio!]) {
      const file = path.join(root, decodeURIComponent(asset.fileUrl.slice(11)));
      await fs.utimes(file, past, past);
      await fs.utimes(path.join(path.dirname(file), '.owner.json'), past, past);
    }
    const snapshot = await loadStorageReferenceSnapshot();
    assert.equal(snapshot.valid, true);
    assert.ok(snapshot.references.has(refs[0]));
    await runStorageMaintenance(false);
    await fs.access(retainedVideo);
    await deleteSavedReel('usr_admin', changed.id, changed.revision);
    await fs.access(retainedVideo);
    assert.ok(await getSavedReel('usr_admin', copy.id));
    console.log(
      'PASS: real clip extraction, bounded timing, independent retention, deduplication, manual caption state, revision conflicts, ownership, original deletion and cleanup protection'
    );

    // Real D1 SQL and private-media backup/restore contracts, with object transport isolated in memory.
    db.exec(
      "CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES ('usr_admin'), ('bob');"
    );
    for (const migration of [
      '0001_project_documents',
      '0002_private_media',
      '0003_media_lifecycle',
      '0005_private_media_quotas',
      '0006_reservation_object_fencing',
      '0007_clip_finder_deletion_fence',
      '0008_media_cleanup_scan_cursor',
    ])
      db.exec(
        await fs.readFile(
          `src/lib/cloudflare/migrations/${migration}.sql`,
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
    let failCatalog = false;
    globalThis.fetch = async (_url, init) => {
      const { sql, params } = JSON.parse(String(init?.body));
      if (failCatalog && sql.includes('project_documents'))
        throw new Error('Catalog offline');
      return Response.json({
        success: true,
        result: [{ success: true, results: db.prepare(sql).all(...params) }],
      });
    };
    const objects = new Map<string, Buffer>();
    const put = async (key: string, filename: string) => {
      objects.set(key, await fs.readFile(filename));
    };
    const get = async (key: string) => {
      assert.ok(objects.has(key));
      return Readable.from([objects.get(key)!]);
    };
    const media: SavedMediaServices = {
      backup: (owner, filename) => backupPrivateMedia(owner, filename, put),
      restore: (owner, filename) => restorePrivateMedia(owner, filename, get),
      hasBackup: hasPrivateMediaBackup,
    };
    const cloud = await saveSavedReel(
      'usr_admin',
      copy.project,
      'http://localhost',
      {},
      media
    );
    assert.equal(
      objects.size,
      2,
      'One private object for video and one for extracted audio'
    );
    const cloudCopy = await saveSavedReel(
      'usr_admin',
      cloud.project,
      'http://localhost',
      {},
      media
    );
    assert.equal(
      objects.size,
      2,
      'Duplicate reel does not duplicate cloud media'
    );
    const clippingDirectory = path.join(
      root,
      'clipping-studio',
      'projects',
      'qa_original'
    );
    await recordMediaOwner(clippingDirectory, 'usr_admin');
    await fs.writeFile(
      path.join(clippingDirectory, 'source.mp4'),
      'disposable source'
    );
    await deleteOwnedClippingProjectDirect('usr_admin', 'qa_original');
    assert.equal(
      await clippingProjectDeleted('qa_original'),
      true,
      'Private-media-only deletion is fenced without changing lifecycle flags'
    );
    assert.ok(await getSavedReel('usr_admin', cloudCopy.id));
    await fs.access(retainedVideo);
    assert.equal((await listSavedReels('usr_admin')).length, 2);
    const cloudUpdated = await saveSavedReel(
      'usr_admin',
      { ...cloud.project, title: 'Cloud edit' },
      'http://localhost',
      { id: cloud.id, revision: 1 },
      media
    );
    assert.equal(cloudUpdated.revision, 2);
    await assert.rejects(
      saveSavedReel(
        'usr_admin',
        cloud.project,
        'http://localhost',
        { id: cloud.id, revision: 1 },
        media
      ),
      /another window/
    );
    failCatalog = true;
    assert.equal(
      (await loadStorageReferenceSnapshot()).valid,
      false,
      'Cloud outage disables destructive orphan GC'
    );
    failCatalog = false;
    assert.ok(
      path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)
    );
    await fs.rm(root, { recursive: true, force: true });
    const recovered = await getSavedReel('usr_admin', cloudCopy.id);
    assert.deepEqual(
      recovered?.project.transcript,
      project.transcript,
      'D1 restores full state after local disk/cache loss'
    );
    assert.equal(await restorePrivateMedia('bob', retainedVideo, get), false);
    assert.equal(
      await restorePrivateMedia('usr_admin', retainedVideo, get),
      true
    );
    await fs.access(retainedVideo);
    assert.equal(await canReadMedia('usr_admin', retainedVideo), true);
    assert.ok((await savedReelMediaReferences()).includes(refs[0]));
    await deleteSavedReel('usr_admin', cloudUpdated.id, cloudUpdated.revision);
    assert.ok(await getSavedReel('usr_admin', cloudCopy.id));
    await fs.access(retainedVideo);
    console.log(
      'PASS: actual D1 SQL, cloud media deduplication, revision updates, full local-cache loss recovery, private ownership restore and cloud deletion without shared-file loss'
    );

    process.env.CLOUD_PRIVATE_MEDIA_ENABLED = 'false';
    process.env.ALLOW_DEMO_LOGIN = 'false';
    assert.equal(
      (await libraryGet(new NextRequest('http://localhost/api/saved-reels')))
        .status,
      401
    );
    process.env.ALLOW_DEMO_LOGIN = 'true';
    assert.equal(
      (
        await librarySave(
          new NextRequest('http://localhost/api/saved-reels', {
            method: 'POST',
            headers: { origin: 'https://untrusted.example' },
            body: '{}',
          })
        )
      ).status,
      403
    );
    console.log(
      'PASS: Saved Reels API authentication and cross-origin write rejection'
    );
  } finally {
    globalThis.fetch = oldFetch;
    Object.assign(APP_CONFIG, oldConfig);
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    db.close();
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
