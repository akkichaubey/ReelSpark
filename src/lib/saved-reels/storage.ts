import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { APP_CONFIG } from '../config';
import { assertSafePath, resolveStoragePath } from '../storage';
import {
  canReadMedia,
  mediaUserNamespace,
  recordMediaOwner,
} from '../media-access';
import {
  backupPrivateMedia,
  hasPrivateMediaBackup,
  privateMediaEnabled,
  restorePrivateMedia,
} from '../cloudflare/private-media';
import { d1Query, getD1Status } from '../cloudflare/d1';
import { validateReelMakerProject } from '../cloudflare/project-documents';
import { registerStorageTask } from '../storage-runtime';
import type { CaptionProject } from '../caption-maker/types';
import type { SavedReel } from './types';

export class ReelConflictError extends Error {}
export const savedReelsCloudEnabled = () =>
  privateMediaEnabled() && getD1Status().configured;
const validId = (id: string) => /^saved_[a-zA-Z0-9_-]{1,100}$/.test(id);
const locks = new Map<string, Promise<unknown>>();
export interface SavedMediaServices {
  backup: typeof backupPrivateMedia;
  restore: typeof restorePrivateMedia;
  hasBackup: typeof hasPrivateMediaBackup;
}
const mediaServices: SavedMediaServices = {
  backup: backupPrivateMedia,
  restore: restorePrivateMedia,
  hasBackup: hasPrivateMediaBackup,
};

async function locked<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(action);
  locks.set(key, next);
  try {
    return await next;
  } finally {
    if (locks.get(key) === next) locks.delete(key);
  }
}

function ownerDir(owner: string) {
  if (!owner) throw new Error('Authentication required');
  return path.join(
    APP_CONFIG.storageRoot,
    '.metadata',
    'saved-reels',
    mediaUserNamespace(owner)
  );
}

export async function listSavedReels(owner: string): Promise<SavedReel[]> {
  if (privateMediaEnabled() && !getD1Status().configured)
    throw new Error(
      'Cloud media is enabled but the metadata database is unavailable'
    );
  if (savedReelsCloudEnabled()) {
    const rows = await d1Query<{ payload: string }>(
      "SELECT payload FROM project_documents WHERE kind = 'saved-reel' AND owner_user_id = ? ORDER BY updated_at DESC",
      [owner]
    );
    if (!rows.success) throw new Error('Saved Reels catalog unavailable');
    return rows.results.map((row) => JSON.parse(row.payload) as SavedReel);
  }
  const directory = ownerDir(owner);
  const entries = await fs
    .readdir(directory)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
  const reels = await Promise.all(
    entries
      .filter(
        (name) => validId(name.replace(/\.json$/, '')) && name.endsWith('.json')
      )
      .map(
        async (name) =>
          JSON.parse(
            await fs.readFile(path.join(directory, name), 'utf8')
          ) as SavedReel
      )
  );
  return reels.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSavedReel(
  owner: string,
  id: string
): Promise<SavedReel | null> {
  if (!validId(id)) throw new Error('Invalid saved reel ID');
  if (privateMediaEnabled() && !getD1Status().configured)
    throw new Error('Saved Reels metadata database is unavailable');
  if (savedReelsCloudEnabled()) {
    const rows = await d1Query<{ payload: string }>(
      "SELECT payload FROM project_documents WHERE kind = 'saved-reel' AND owner_user_id = ? AND id = ? LIMIT 1",
      [owner, id]
    );
    if (!rows.success) throw new Error('Saved Reels catalog unavailable');
    return rows.results[0]
      ? (JSON.parse(rows.results[0].payload) as SavedReel)
      : null;
  }
  try {
    return JSON.parse(
      await fs.readFile(path.join(ownerDir(owner), `${id}.json`), 'utf8')
    ) as SavedReel;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function listSavedReelsPage(owner: string, options: { page: number; query: string; sort: string; filter: string }) {
  const pageSize = 24;
  let rows: SavedReel[];
  if (savedReelsCloudEnabled()) {
    const conditions = ["kind = 'saved-reel'", 'owner_user_id = ?'];
    const parameters: (string | number)[] = [owner];
    if (options.query) {
      conditions.push("LOWER(json_extract(payload,'$.title') || ' ' || COALESCE(json_extract(payload,'$.originProjectName'),'')) LIKE ? ESCAPE '\\'");
      parameters.push(`%${options.query.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`);
    }
    if (options.filter === 'rendered') conditions.push("json_extract(payload,'$.project.renderedVideoUrl') IS NOT NULL");
    if (options.filter === 'editable') conditions.push("json_extract(payload,'$.project.renderedVideoUrl') IS NULL");
    if (options.filter === 'captions') conditions.push("json_array_length(json_extract(payload,'$.project.captionGroups')) > 0");
    const order = options.sort === 'name' ? "json_extract(payload,'$.title') COLLATE NOCASE ASC" : options.sort === 'created' ? "json_extract(payload,'$.createdAt') DESC" : options.sort === 'duration' ? "CASE WHEN json_extract(payload,'$.project.timeline.enabled') = 1 THEN COALESCE((SELECT MAX(json_extract(value,'$.startMs') + json_extract(value,'$.durationMs')) / 1000.0 FROM json_each(json_extract(payload,'$.project.timeline.clips'))),0) ELSE COALESCE(json_extract(payload,'$.project.trimRange.end') - json_extract(payload,'$.project.trimRange.start'),json_extract(payload,'$.project.audio.duration'),json_extract(payload,'$.project.image.duration'),0) END DESC" : 'updated_at DESC';
    const result = await d1Query<{ payload: string }>(`SELECT payload FROM project_documents WHERE ${conditions.join(' AND ')} ORDER BY ${order},id ASC LIMIT ? OFFSET ?`, [...parameters, pageSize + 1, options.page * pageSize]);
    if (!result.success) throw new Error('Saved Reels catalog unavailable');
    rows = result.results.map(row => JSON.parse(row.payload) as SavedReel);
  } else {
    const { reelDuration } = await import('./types');
    rows = (await listSavedReels(owner)).filter(reel => `${reel.title} ${reel.originProjectName || ''}`.toLowerCase().includes(options.query.toLowerCase()) && (options.filter === 'all' || (options.filter === 'rendered' ? Boolean(reel.project.renderedVideoUrl) : options.filter === 'captions' ? reel.project.captionGroups.length > 0 : !reel.project.renderedVideoUrl))).sort((a,b) => options.sort === 'name' ? a.title.localeCompare(b.title) : options.sort === 'duration' ? reelDuration(b.project) - reelDuration(a.project) : options.sort === 'created' ? b.createdAt.localeCompare(a.createdAt) : b.updatedAt.localeCompare(a.updatedAt)).slice(options.page * pageSize, (options.page + 1) * pageSize + 1);
  }
  return { reels: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}

/** Immutable retained media lives outside deletable project directories. Hashes deduplicate across this owner's reels. */
async function retainFile(
  owner: string,
  source: string,
  media: SavedMediaServices
): Promise<string> {
  if (!(await canReadMedia(owner, source))) {
    if (
      !(await media.restore(owner, source)) ||
      !(await canReadMedia(owner, source))
    )
      throw new Error('A reel media file is unavailable to this account');
  }
  const realRoot = await fs.realpath(APP_CONFIG.storageRoot);
  const realSource = assertSafePath(await fs.realpath(source), realRoot);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(realSource)) hash.update(chunk);
  const digest = hash.digest('hex');
  const directory = path.join(
    APP_CONFIG.storageRoot,
    'caption-maker',
    `asset_saved_${mediaUserNamespace(owner)}_${digest}`
  );
  const extension = path.extname(source).toLowerCase();
  if (!/^\.[a-z0-9]{1,8}$/.test(extension))
    throw new Error('Unsupported retained media extension');
  const target = path.join(directory, `media${extension}`);
  return locked(target, async () => {
    await recordMediaOwner(directory, owner);
    assertSafePath(await fs.realpath(directory), realRoot);
    const finish = registerStorageTask({
      id: `retain_${randomUUID()}`,
      ownerId: owner,
      kind: 'transcode',
      paths: [source, directory],
    });
    try {
      const exists = await fs.stat(target).catch(() => null);
      if (!exists) {
        const temp = path.join(directory, `.${randomUUID()}.tmp`);
        try {
          await fs.copyFile(realSource, temp);
          await fs.rename(temp, target);
        } finally {
          await fs.rm(temp, { force: true });
        }
      }
      if (privateMediaEnabled() && !(await media.hasBackup(owner, target))) {
        if (!(await media.backup(owner, target)))
          throw new Error('Reel media cloud backup could not be confirmed');
      }
      return `/api/files/${path.relative(APP_CONFIG.storageRoot, target).split(path.sep).map(encodeURIComponent).join('/')}`;
    } finally {
      finish();
    }
  });
}

/** Preserve the complete JSON state; only media locations change. No timing/style regeneration. */
export async function retainReelProject(
  owner: string,
  input: unknown,
  origin: string,
  media: SavedMediaServices = mediaServices
): Promise<CaptionProject> {
  const project = structuredClone(validateReelMakerProject(owner, input));
  if (!project.audio && !project.image && !project.timeline?.clips.length)
    throw new Error('Upload media before saving a reel');
  if (
    (project.audio && !project.audio.fileUrl) ||
    (project.image && !project.image.fileUrl)
  )
    throw new Error('Invalid reel media URL');
  const duration = project.audio?.duration || project.image?.duration || 0;
  if (
    project.trimRange &&
    (!Number.isFinite(project.trimRange.start) ||
      !Number.isFinite(project.trimRange.end) ||
      project.trimRange.start < 0 ||
      project.trimRange.end <= project.trimRange.start ||
      project.trimRange.end > duration + 0.05)
  )
    throw new Error('Invalid reel trim range');
  const retained = new Map<string, string>();
  async function visit(value: unknown, key = ''): Promise<unknown> {
    if (typeof value === 'string' && /(?:Url|Path)$/i.test(key) && value) {
      if (
        /^(thumbnailUrl|customBgUrl)$/i.test(key) &&
        /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
      )
        return value;
      let source: string | undefined;
      if (value.startsWith('/api/files/') || /^https?:/.test(value)) {
        const url = new URL(value, origin);
        if (url.origin !== origin)
          throw new Error('Re-upload external media before saving a reel');
        if (url.pathname.startsWith('/api/files/'))
          source = resolveStoragePath(
            decodeURIComponent(url.pathname.slice(11))
          );
        else throw new Error('Reel media must be a stored file');
      } else if (/Path$/i.test(key)) {
        // URL fields are authoritative across redeployments. Absolute local paths are not persisted.
        return undefined;
      } else if (
        !value.startsWith('/audio/bgm/') &&
        !['/sample-audio.mp3', '/sample-image.jpg'].includes(value)
      ) {
        throw new Error('Re-upload temporary media before saving a reel');
      }
      if (source) {
        if (!retained.has(source))
          retained.set(source, await retainFile(owner, source, media));
        return retained.get(source);
      }
      return value;
    }
    if (Array.isArray(value))
      return Promise.all(value.map((item) => visit(item, key)));
    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [childKey, child] of Object.entries(value))
        result[childKey] = await visit(child, childKey);
      return result;
    }
    return value;
  }
  const saved = (await visit(project)) as CaptionProject;
  if (project.renderedSrtPath) {
    const source = assertSafePath(project.renderedSrtPath);
    saved.renderedSrtUrl =
      retained.get(source) || (await retainFile(owner, source, media));
  }
  return saved;
}

export async function saveSavedReel(
  owner: string,
  input: unknown,
  origin: string,
  options: {
    id?: string;
    revision?: number;
    originProjectId?: string;
    originProjectName?: string;
  } = {},
  media: SavedMediaServices = mediaServices
): Promise<SavedReel> {
  const id = options.id || `saved_${randomUUID()}`;
  if (!validId(id)) throw new Error('Invalid saved reel ID');
  return locked(`${owner}:${id}`, async () => {
    const finish = registerStorageTask({
      id: `save_reel_${randomUUID()}`,
      ownerId: owner,
      kind: 'transcode',
      paths: [APP_CONFIG.storageRoot],
    });
    try {
      const previous = await getSavedReel(owner, id);
      if (options.id && !previous) throw new Error('Saved reel not found');
      if (previous && previous.revision !== options.revision)
        throw new ReelConflictError(
          'This reel changed in another window. Reopen it before saving.'
        );
      const project = await retainReelProject(owner, input, origin, media);
      const now = new Date().toISOString();
      const reel: SavedReel = {
        id,
        title: project.title,
        project: { ...project, id, updatedAt: now },
        revision: (previous?.revision || 0) + 1,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
        originProjectId:
          previous?.originProjectId || options.originProjectId?.slice(0, 160),
        originProjectName:
          previous?.originProjectName ||
          options.originProjectName?.slice(0, 300),
      };
      const payload = JSON.stringify(reel);
      if (Buffer.byteLength(payload) > 1_500_000)
        throw new Error('Saved reel metadata exceeds 1.5 MB');
      if (savedReelsCloudEnabled()) {
        const result = previous
          ? await d1Query<{ id: string }>(
              "UPDATE project_documents SET payload = ?, updated_at = ? WHERE kind = 'saved-reel' AND id = ? AND owner_user_id = ? AND payload = ? RETURNING id",
              [payload, now, id, owner, JSON.stringify(previous)]
            )
          : await d1Query<{ id: string }>(
              "INSERT INTO project_documents (kind,id,owner_user_id,payload,updated_at) VALUES ('saved-reel',?,?,?,?) ON CONFLICT DO NOTHING RETURNING id",
              [id, owner, payload, now]
            );
        if (!result.success) throw new Error('Saved Reels catalog save failed');
        if (result.results.length !== 1)
          throw new ReelConflictError(
            'This reel changed in another window. Reopen it before saving.'
          );
      } else {
        const directory = ownerDir(owner);
        await fs.mkdir(directory, { recursive: true });
        const temp = path.join(directory, `${id}.${randomUUID()}.tmp`);
        try {
          await fs.writeFile(temp, payload, { flag: 'wx' });
          await fs.rename(temp, path.join(directory, `${id}.json`));
        } finally {
          await fs.rm(temp, { force: true });
        }
      }
      return reel;
    } finally {
      finish();
    }
  });
}

export async function deleteSavedReel(
  owner: string,
  id: string,
  revision: number
): Promise<void> {
  await locked(`${owner}:${id}`, async () => {
    const reel = await getSavedReel(owner, id);
    if (!reel) throw new Error('Saved reel not found');
    if (reel.revision !== revision)
      throw new ReelConflictError(
        'This reel changed. Refresh the library before deleting.'
      );
    if (savedReelsCloudEnabled()) {
      const result = await d1Query<{ id: string }>(
        "DELETE FROM project_documents WHERE kind = 'saved-reel' AND id = ? AND owner_user_id = ? AND payload = ? RETURNING id",
        [id, owner, JSON.stringify(reel)]
      );
      if (!result.success || result.results.length !== 1)
        throw new ReelConflictError(
          'Reel deletion could not be confirmed; refresh and retry'
        );
    } else await fs.unlink(path.join(ownerDir(owner), `${id}.json`));
    // Never cascade-delete shared media here. Existing orphan maintenance owns physical cleanup.
  });
}

/** Server-authoritative references protect reels even when no browser cache survives. Failure disables GC. */
export async function savedReelMediaReferences(): Promise<string[]> {
  if (privateMediaEnabled() && !getD1Status().configured)
    throw new Error('Saved Reel reference catalog unavailable');
  let reels: SavedReel[] = [];
  if (savedReelsCloudEnabled()) {
    const rows = await d1Query<{ payload: string }>(
      "SELECT payload FROM project_documents WHERE kind = 'saved-reel'"
    );
    if (!rows.success)
      throw new Error('Saved Reel reference inventory unavailable');
    reels = rows.results.map((row) => JSON.parse(row.payload));
  } else {
    const root = path.join(APP_CONFIG.storageRoot, '.metadata', 'saved-reels');
    const owners = await fs
      .readdir(root)
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      });
    for (const owner of owners.filter((value) =>
      /^[a-f0-9]{64}$/.test(value)
    )) {
      const directory = path.join(root, owner);
      for (const file of await fs.readdir(directory)) {
        if (file.endsWith('.json') && validId(file.slice(0, -5)))
          reels.push(
            JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'))
          );
      }
    }
  }
  const refs = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === 'string' && value.startsWith('/api/files/'))
      refs.add(decodeURIComponent(value.slice(11)));
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object')
      Object.values(value).forEach(visit);
  };
  reels.forEach((reel) => visit(reel.project));
  return [...refs];
}
