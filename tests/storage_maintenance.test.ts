import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { APP_CONFIG } from '../src/lib/config';
import { runStorageMaintenance } from '../src/lib/storage-maintenance';
import { cancelStorageTask, isStoragePathActive, registerStorageTask } from '../src/lib/storage-runtime';
import { streamRequestBodyToFile } from '../src/lib/stream-upload';
import { deleteProject, getProjectDirs, ProjectMediaReferencedError, saveProject } from '../src/lib/storage';

async function run(): Promise<void> {
  const original = {
    storageRoot: APP_CONFIG.storageRoot,
    projectsDir: APP_CONFIG.projectsDir,
    tempDir: APP_CONFIG.tempDir,
  };
  const previousEnv = {
    cleanup: process.env.STORAGE_CLEANUP_ENABLED,
    tempHours: process.env.STORAGE_TEMP_RETENTION_HOURS,
    lifecycle: process.env.CLOUD_MEDIA_LIFECYCLE_ENABLED,
    privateMedia: process.env.CLOUD_PRIVATE_MEDIA_ENABLED,
  };
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reelspark-storage-test-'));
  APP_CONFIG.storageRoot = root;
  APP_CONFIG.projectsDir = path.join(root, 'projects');
  APP_CONFIG.tempDir = path.join(root, 'temp');
  process.env.STORAGE_CLEANUP_ENABLED = 'false';
  process.env.STORAGE_TEMP_RETENTION_HOURS = '1';
  process.env.CLOUD_MEDIA_LIFECYCLE_ENABLED = 'false';
  process.env.CLOUD_PRIVATE_MEDIA_ENABLED = 'false';

  try {
    const partial = path.join(root, 'projects', 'project-1', 'media', '.incoming-test');
    await fs.mkdir(path.dirname(partial), { recursive: true });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.error(new Error('simulated network interruption'));
      },
    });
    const request = new Request('http://localhost/upload', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit);
    await assert.rejects(() => streamRequestBodyToFile(request, partial));
    assert.equal(await fs.stat(partial).catch(() => null), null, 'failed streaming upload must remove its partial file');

    const taskPath = path.join(root, 'projects', 'project-2');
    const controller = new AbortController();
    let finish = () => {};
    const finishTask = registerStorageTask({
      id: 'upload-session-1234567890',
      ownerId: 'owner-test',
      kind: 'upload',
      paths: [taskPath],
      cancel: () => { controller.abort(); finish(); },
    });
    finish = finishTask;
    assert.equal(isStoragePathActive(path.join(taskPath, 'media.mp4')), true);
    assert.equal(await cancelStorageTask('upload-session-1234567890', 'other-owner'), 'not-found');
    assert.equal(await cancelStorageTask('upload-session-1234567890', 'owner-test'), 'cancelled');
    assert.equal(controller.signal.aborted, true);
    assert.equal(isStoragePathActive(taskPath), false);

    const sourceProject = { id: 'project-source', ownerUserId: 'owner-test', title: 'Source', status: 'QUEUED', candidates: [] } as any;
    const referencingProject = { id: 'project-reference', ownerUserId: 'owner-test', title: 'Reference', status: 'QUEUED', candidates: [], sourcePath: path.join(root, 'projects', 'project-source', 'original', 'video.mp4') } as any;
    const sourceDirs = getProjectDirs(sourceProject.id);
    await fs.writeFile(path.join(sourceDirs.originalDir, 'video.mp4'), 'source');
    await saveProject(sourceProject);
    await saveProject(referencingProject);
    await assert.rejects(() => deleteProject(sourceProject.id), ProjectMediaReferencedError);
    assert.equal(await fs.stat(sourceDirs.rootDir).then(() => true), true, 'referenced project files must remain');
    await deleteProject(referencingProject.id);

    let deletionFinish = () => {};
    const finishDeletionTask = registerStorageTask({
      id: 'render-session-1234567890',
      ownerId: 'owner-test',
      kind: 'render',
      paths: [sourceDirs.rootDir],
      cancel: () => deletionFinish(),
    });
    deletionFinish = finishDeletionTask;
    assert.equal(await deleteProject(sourceProject.id), true, 'project deletion should stop work before removing files');
    assert.equal(await fs.stat(sourceDirs.rootDir).catch(() => null), null);

    const recovery = { id: 'project-recovery', ownerUserId: 'owner-test', title: 'Recovery', status: 'RENDERING', candidates: [{ renderStatus: 'rendering' }] } as any;
    const recoveryDirs = getProjectDirs(recovery.id);
    await saveProject(recovery);
    const recoveryManifest = JSON.parse(await fs.readFile(recoveryDirs.manifestFile, 'utf8'));
    recoveryManifest.updatedAt = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    await fs.writeFile(recoveryDirs.manifestFile, JSON.stringify(recoveryManifest));

    const abandonedDir = path.join(root, 'caption-maker', 'asset_abandoned');
    await fs.mkdir(abandonedDir, { recursive: true });
    await fs.writeFile(path.join(abandonedDir, '.owner.json'), JSON.stringify({ userId: 'owner-test' }));
    await fs.writeFile(path.join(abandonedDir, '.abandoned-upload.json'), JSON.stringify({ failedAt: new Date(0).toISOString() }));
    const abandonedMedia = path.join(abandonedDir, 'abandoned.mp3');
    await fs.writeFile(abandonedMedia, 'temporary media');
    const oldTime = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000);
    await fs.utimes(abandonedMedia, oldTime, oldTime);
    await fs.utimes(path.join(abandonedDir, '.abandoned-upload.json'), oldTime, oldTime);

    const dryRun = await runStorageMaintenance(true);
    assert.equal(await fs.stat(abandonedMedia).then(() => true).catch(() => false), true, 'dry-run must never delete abandoned media');
    assert.ok(dryRun.local.directoriesDeleted >= 1, 'dry-run should report eligible cleanup candidates');

    const cleanup = await runStorageMaintenance(false);
    assert.equal(await fs.stat(abandonedDir).catch(() => null), null, 'expired abandoned upload should be removed');
    assert.ok(cleanup.local.directoriesDeleted >= 1);
    const recovered = JSON.parse(await fs.readFile(recoveryDirs.manifestFile, 'utf8'));
    assert.equal(recovered.status, 'QUEUED', 'interrupted render should be reset for safe retry');
    assert.equal(recovered.candidates[0].renderStatus, 'failed');

    const activeTemporary = path.join(root, 'projects', 'project-active', '.render-active.mp4');
    await fs.mkdir(path.dirname(activeTemporary), { recursive: true });
    await fs.writeFile(activeTemporary, 'active render');
    await fs.utimes(activeTemporary, oldTime, oldTime);
    let finishActiveRender = () => {};
    const finishActiveTask = registerStorageTask({
      id: 'active-render-session-123456',
      ownerId: 'owner-test',
      kind: 'render',
      paths: [path.dirname(activeTemporary)],
      cancel: () => finishActiveRender(),
    });
    finishActiveRender = finishActiveTask;
    await runStorageMaintenance(false);
    assert.equal(await fs.stat(activeTemporary).then(() => true), true, 'janitor must preserve active render output');
    finishActiveRender();
    await runStorageMaintenance(false);
    assert.equal(await fs.stat(activeTemporary).catch(() => null), null, 'expired temp output should be removed after task finishes');
    console.log('PASS: failed-upload partials are deleted, cancellation is owner-checked, and storage maintenance dry-run/cleanup are safe');
  } finally {
    APP_CONFIG.storageRoot = original.storageRoot;
    APP_CONFIG.projectsDir = original.projectsDir;
    APP_CONFIG.tempDir = original.tempDir;
    for (const [key, value] of Object.entries({
      STORAGE_CLEANUP_ENABLED: previousEnv.cleanup,
      STORAGE_TEMP_RETENTION_HOURS: previousEnv.tempHours,
      CLOUD_MEDIA_LIFECYCLE_ENABLED: previousEnv.lifecycle,
      CLOUD_PRIVATE_MEDIA_ENABLED: previousEnv.privateMedia,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
