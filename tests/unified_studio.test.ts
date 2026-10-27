import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { NextRequest } from 'next/server';
import { linkAnalysisProject, primaryWorkspaceForSource, studioProjectUrl } from '../src/lib/clipping-studio/project-bridge';
import { ClippingProjectSchema } from '../src/lib/clipping-studio/contracts';
import { fromStorageReference, toStorageReference } from '../src/lib/cloudflare/storage-references';
import type { Project, ClipCandidate } from '../src/lib/types';
import { APP_CONFIG, getFfmpegPath } from '../src/lib/config';
import { saveProject, loadProject, deleteProject, getProjectDirs } from '../src/lib/storage';
import { clippingProjectAccess } from '../src/lib/media-api-access';
import { POST } from '../src/app/api/clipping-studio/link-project/route';
import { DELETE as deleteStudio } from '../src/app/api/clipping-studio/projects/[id]/route';
import { useClippingStore } from '../src/lib/clipping-studio/use-clipping-store';
import { getCacheAccount, setCacheAccount } from '../src/lib/account-cache';

const candidate = (id: string, selected = true): ClipCandidate => ({
  id, selected, title: `Moment ${id}`, titleHindi: 'क्षण', start: 1.234, end: 3.789, duration: 2.555,
  topic: 'Other', explanation: 'A complete moment', transcript: 'Original words', firstWords: 'Original', lastWords: 'words',
  scores: { meaningAndDepth: 20, standaloneCompleteness: 20, openingStrength: 10, emotionalIntellectualImpact: 10, clarity: 10, conciseness: 10, audioQuality: 5, total: 85 },
  contextVerification: { isCompleteThought: true, hasConclusion: true, hasDanglingPronouns: false, contextConfidence: 90, notes: '', flaggedForReview: false },
});
const fixture = (): Project => ({
  id: 'proj_bridge_test', ownerUserId: 'usr_admin', title: 'Original analysis', sourceType: 'upload',
  localVideoPath: '/storage/projects/proj_bridge_test/original/video.mp4', originalFileName: 'video.mp4',
  status: 'COMPLETED', progress: 100, statusMessage: 'Complete',
  videoMetadata: { duration: 10, width: 320, height: 240, aspectRatio: '4:3', fps: 25, format: 'mp4', sizeBytes: 100, hasAudio: true },
  settings: { durationLimit: '30', aspectRatio: 'vertical_blur', normalizeAudio: false, burnSubtitles: true, subtitleStyle: { fontSize: 42, fontColor: '#FFFF00', outlineColor: '#000000', outlineWidth: 3, verticalPosition: 'top', alignment: 'center' } },
  candidates: [candidate('one'), candidate('two', false)], transcript: [{ id: 'word', start: 0, end: 5, text: 'Original transcript' }],
  timelineCoverage: { analyzedSeconds: 10, totalSeconds: 10, coveragePercent: 100, ranges: [[0, 10]] },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
});

async function main() {
  const source = fixture();
  const snapshot = structuredClone(source);
  const linked = linkAnalysisProject(source);
  assert.equal(linked.clips.length, 0, 'Opening does not silently import candidates');
  assert.equal(linked.mediaAssets[0].localPath, source.localVideoPath, 'Reuse original upload');
  assert.ok(ClippingProjectSchema.safeParse(linked).success);
  const imported = linkAnalysisProject(source, linked, true);
  assert.equal(imported.clips.length, 1, 'Only selected candidates import');
  assert.equal(imported.clips[0].startMs, 1234);
  assert.equal(imported.clips[0].endMs, 3789);
  assert.equal(imported.clips[0].durationMs, 2555);
  imported.clips[0] = { ...imported.clips[0], startMs: 1500, durationMs: 2289, name: 'Manual edit' };
  imported.name = 'Renamed workspace';
  imported.mergeRecipes.push({ id: 'recipe', projectId: imported.id, name: 'Keep recipe', items: [{ id: 'item', recipeId: 'recipe', clipId: imported.clips[0].id, orderIndex: 0, transition: 'cut' }], outputFormat: 'wav', targetResolution: 'source', normalizeAudio: true, createdAt: source.createdAt, updatedAt: source.updatedAt });
  imported.exportJobs.push({ id: 'export', projectId: imported.id, jobType: 'merge_recipe', targetId: 'recipe', status: 'completed', progressPercent: 100, sourceMappings: [], createdAt: source.createdAt });
  const repeated = linkAnalysisProject(source, imported, true);
  assert.deepEqual(repeated, imported, 'Repeated import preserves edited clips, recipes, jobs and title');
  assert.deepEqual(source, snapshot, 'Never mutate AI transcript/settings/candidates');
  const more = { ...source, candidates: [...source.candidates, candidate('three')] };
  assert.equal(linkAnalysisProject(more, imported, true).clips.length, 2);
  for (const bounds of [{ start: -1, end: 1 }, { start: 1, end: 11 }, { start: NaN, end: 2 }, { start: 2, end: 2 }]) {
    assert.throws(() => linkAnalysisProject({ ...source, candidates: [{ ...candidate('bad'), ...bounds }] }, linked, true), /Invalid timing/);
  }
  assert.equal(linkAnalysisProject({ ...source, localVideoPath: undefined }).mediaAssets.length, 0);
  assert.throws(() => linkAnalysisProject({ ...source, localVideoPath: undefined }, undefined, true), /original media/);
  assert.throws(() => linkAnalysisProject({ ...source, id: 'other' }, linked), /different AI project/);
  assert.equal(new URL(studioProjectUrl('a b'), 'http://localhost').searchParams.get('project'), 'a b');
  assert.equal(primaryWorkspaceForSource(source.id, [{ ...linked, id: 'duplicate', createdAt: '2026-02-01T00:00:00Z' }, linked])?.id, linked.id, 'A duplicate must not replace the original linked workspace');
  assert.ok(ClippingProjectSchema.safeParse({ ...linked, sourceProjectId: undefined, sourceMediaAssetId: undefined }).success, 'Legacy documents remain valid');
  console.log('PASS adapter: selection, precision, idempotency, manual edits, recipes/jobs, source immutability, boundary validation and legacy schemas');

  const oldState = useClippingStore.getState();
  const oldWindow = globalThis.window;
  const oldAccount = getCacheAccount();
  const oldFetch = globalThis.fetch;
  const cache = new Map<string, string>();
  Object.assign(globalThis, { window: { localStorage: { getItem: (key: string) => cache.get(key) || null, setItem: (key: string, value: string) => cache.set(key, value), removeItem: (key: string) => cache.delete(key) } } });
  setCacheAccount('studio-test');
  try {
    useClippingStore.setState({ projects: [], activeProject: null, checkServices: async () => {} });
    useClippingStore.getState().acceptLinkedProject(linked);
    useClippingStore.getState().acceptLinkedProject(imported);
    assert.equal(useClippingStore.getState().activeProject?.clips.length, 1);
    assert.equal(useClippingStore.getState().canUndo, true);
    useClippingStore.getState().undo();
    assert.equal(useClippingStore.getState().activeProject?.clips.length, 0, 'Import can be undone');
    useClippingStore.getState().redo();
    assert.equal(useClippingStore.getState().activeProject?.clips[0].name, 'Manual edit');
    const { duplicateProjectLocally } = await import('../src/lib/clipping-studio/local-persistence');
    const copy = duplicateProjectLocally(imported.id)!;
    assert.equal(copy.mergeRecipes[0].items[0].clipId, copy.clips[0].id, 'Duplicated recipes must refer to duplicated clips');
    assert.equal(copy.mergeRecipes[0].items[0].recipeId, copy.mergeRecipes[0].id);
    assert.equal(copy.mediaAssets[0].projectId, copy.id);
    assert.equal(linkAnalysisProject(source, copy, true).clips.length, 1, 'Duplicated AI clips retain import provenance');
    assert.equal(imported.exportJobs.length, 1, 'Duplicating must not alter original export history');
    const pending: Array<(response: Response) => void> = [];
    globalThis.fetch = async () => new Promise<Response>(resolve => pending.push(resolve));
    const first = useClippingStore.getState().initializeStore();
    const second = useClippingStore.getState().initializeStore();
    useClippingStore.getState().setActiveTab('ai');
    pending[1](Response.json({ success: true, enabled: true, projects: [{ ...imported, name: 'Newest cloud state', updatedAt: '2099-01-01T00:00:00Z' }] }));
    await second;
    pending[0](Response.json({ success: true, enabled: true, projects: [{ ...imported, name: 'Stale response', updatedAt: '2099-01-02T00:00:00Z' }] }));
    await first;
    assert.equal(useClippingStore.getState().activeProject?.name, 'Newest cloud state', 'Stale initialization must not replace the latest response');
    assert.equal(useClippingStore.getState().activeTab, 'ai', 'Async initialization must preserve the requested tab');
    setCacheAccount('another-user');
    const { loadProjectsLocally } = await import('../src/lib/clipping-studio/local-persistence');
    assert.equal(loadProjectsLocally().length, 0, 'Linked project cache stays account-scoped');
    console.log('PASS store: import undo/redo, account isolation, out-of-order initialization protection and AI tab retention');
  } finally {
    useClippingStore.setState(oldState);
    globalThis.fetch = oldFetch;
    setCacheAccount(oldAccount);
    if (oldWindow === undefined) Reflect.deleteProperty(globalThis, 'window'); else globalThis.window = oldWindow;
  }

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reelspark-unified-'));
  const savedConfig = { storageRoot: APP_CONFIG.storageRoot, projectsDir: APP_CONFIG.projectsDir, tempDir: APP_CONFIG.tempDir };
  const envKeys = ['NODE_ENV', 'ALLOW_DEMO_LOGIN', 'CLOUD_PROJECT_METADATA_ENABLED', 'CLOUD_PRIVATE_MEDIA_ENABLED', 'CLOUD_MEDIA_LIFECYCLE_ENABLED'] as const;
  const savedEnv = new Map(envKeys.map(key => [key, process.env[key]]));
  Object.assign(APP_CONFIG, { storageRoot: root, projectsDir: path.join(root, 'projects'), tempDir: path.join(root, 'temp') });
  Object.assign(process.env, { NODE_ENV: 'development', ALLOW_DEMO_LOGIN: 'true', CLOUD_PROJECT_METADATA_ENABLED: 'false', CLOUD_PRIVATE_MEDIA_ENABLED: 'false', CLOUD_MEDIA_LIFECYCLE_ENABLED: 'false' });
  const request = (body: unknown, origin = 'http://localhost') => new NextRequest('http://localhost/api/clipping-studio/link-project', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) });
  try {
    const original = fixture();
    const dirs = getProjectDirs(original.id);
    original.localVideoPath = path.join(dirs.originalDir, 'video.mp4');
    await fs.writeFile(original.localVideoPath, 'fixture');
    await saveProject(original);
    const response = await POST(request({ sourceProjectId: original.id, importSelected: true }));
    assert.equal(response.status, 200, await response.clone().text());
    const data = await response.json();
    assert.equal(data.workspace.clips.length, 1);
    assert.deepEqual((await loadProject(original.id))?.settings, original.settings);
    const repeatedResponse = await POST(request({ sourceProjectId: original.id, workspace: data.workspace, importSelected: true }));
    const repeatedData = await repeatedResponse.json();
    assert.equal(repeatedData.workspace.clips.length, 1);
    const editedWorkspace = { ...repeatedData.workspace, name: 'Saved timeline edits', updatedAt: new Date().toISOString() };
    assert.equal((await POST(request({ sourceProjectId: original.id, workspace: editedWorkspace }))).status, 200);
    const reopened = await (await POST(request({ sourceProjectId: original.id }))).json();
    assert.equal(reopened.workspace.name, 'Saved timeline edits', 'Reopening without a browser cache must retain saved timeline data');
    assert.equal(reopened.workspace.clips.length, 1);
    const referenceFile = path.join(root, 'clipping-studio', 'projects', reopened.workspace.id, 'linked-workspace.json');
    const savedReference = await fs.readFile(referenceFile, 'utf8');
    await fs.writeFile(referenceFile, '{corrupt');
    assert.equal((await POST(request({ sourceProjectId: original.id }))).status, 409, 'A damaged saved workspace must never be silently replaced');
    assert.equal(await fs.readFile(referenceFile, 'utf8'), '{corrupt');
    await fs.writeFile(referenceFile, savedReference);
    await assert.rejects(deleteProject(original.id), /referenced/);
    assert.equal((await POST(request({ sourceProjectId: original.id }, 'https://evil.example'))).status, 403);
    assert.equal((await POST(request({ sourceProjectId: '../private' }))).status, 400);
    await saveProject({ ...original, id: 'other_owner', ownerUserId: 'someone_else' });
    assert.equal((await POST(request({ sourceProjectId: 'other_owner' }))).status, 404);
    process.env.ALLOW_DEMO_LOGIN = 'false';
    assert.equal((await POST(request({ sourceProjectId: original.id }))).status, 401);
    process.env.ALLOW_DEMO_LOGIN = 'true';
    const portable = toStorageReference(original.localVideoPath);
    assert.equal(fromStorageReference(portable), original.localVideoPath);
    assert.throws(() => fromStorageReference('reelspark-storage:projects/../outside'), /Invalid/);
    await fs.unlink(original.localVideoPath);
    const missing = await POST(request({ sourceProjectId: original.id }));
    assert.equal(missing.status, 200, 'Analysis can open even when source media is offline');
    assert.match((await missing.json()).warning, /unavailable/);
    assert.equal((await POST(request({ sourceProjectId: original.id, importSelected: true }))).status, 404);

    const workspace = { ...linked, id: 'manual_test', sourceProjectId: undefined, sourceMediaAssetId: undefined, clips: [], mediaAssets: [{ ...linked.mediaAssets[0], id: 'asset_test', projectId: 'manual_test' }] };
    const manualDir = await clippingProjectAccess('usr_admin', workspace.id, true);
    const media = path.join(manualDir!, 'audio.wav');
    execFileSync(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-y', media], { windowsHide: true });
    workspace.mediaAssets[0].localPath = media;
    const reverse = await POST(request({ workspace, assetId: 'asset_test' }));
    assert.equal(reverse.status, 200, await reverse.clone().text());
    const reverseData = await reverse.json();
    assert.equal(reverseData.project.localVideoPath, media);
    assert.equal(reverseData.workspace.mediaAssets.length, 1, 'Reverse link reuses selected Studio asset');
    const secondReverse = await POST(request({ workspace, assetId: 'asset_test' }));
    assert.equal((await secondReverse.json()).project.id, reverseData.project.id, 'Reverse links are idempotent');
    const blockedDelete = await deleteStudio(new NextRequest(`http://localhost/api/clipping-studio/projects/${workspace.id}`, { method: 'DELETE' }), { params: Promise.resolve({ id: workspace.id }) });
    assert.equal(blockedDelete.status, 409, 'Studio source cannot be deleted beneath linked AI analysis');
    console.log('PASS routes: actual linking both directions, existing media reuse, no duplicate reverse projects, auth/origin/ownership, shared-file deletion guards, offline source and portable paths');
  } finally {
    Object.assign(APP_CONFIG, savedConfig);
    for (const [key, value] of savedEnv) { if (value === undefined) delete process.env[key]; else Object.assign(process.env, { [key]: value }); }
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
