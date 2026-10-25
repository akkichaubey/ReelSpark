import { d1Query, getD1Status } from './d1';
import { ClippingProjectSchema, type ClippingProject } from '../clipping-studio/contracts';
import { mediaLifecycleEnabled } from './media-lifecycle-state';
import { mapClippingStorage } from './storage-references';
import type { Project } from '../types';
import type { CaptionProject } from '../caption-maker/types';

export function projectCloudEnabled(): boolean {
  return process.env.CLOUD_PROJECT_METADATA_ENABLED === 'true' && getD1Status().configured;
}

function validateClipFinderProject(ownerId: string, input: unknown): Project {
  if (!ownerId || !input || typeof input !== 'object') throw new Error('Invalid project document');
  const project = input as Project;
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(project.id || '') || project.ownerUserId !== ownerId ||
      typeof project.title !== 'string' || !Array.isArray(project.transcript) || !Array.isArray(project.candidates)) {
    throw new Error('Invalid project document');
  }
  return project;
}

function stripCaptionMakerLocalPaths(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripCaptionMakerLocalPaths);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !['storagePath', 'renderedVideoPath', 'renderedSrtPath'].includes(key))
      .map(([key, child]) => [key, stripCaptionMakerLocalPaths(child)])
  );
}

export function validateReelMakerProject(ownerId: string, input: unknown): CaptionProject {
  if (!ownerId || !input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid Reel Maker project');
  const project = input as CaptionProject;
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(project.id || '') ||
      typeof project.title !== 'string' || project.title.length > 300 ||
      !Array.isArray(project.transcript) || !Array.isArray(project.captionGroups) ||
      !project.captionStyle || typeof project.captionStyle !== 'object' ||
      !project.outputSettings || typeof project.outputSettings !== 'object' ||
      typeof project.createdAt !== 'string' || typeof project.updatedAt !== 'string') {
    throw new Error('Invalid Reel Maker project');
  }
  return project;
}

/** Persist the current Reel Maker state in D1 so the same account can reopen it on another device. */
export async function saveReelMakerDocument(ownerId: string, input: unknown): Promise<CaptionProject> {
  const project = validateReelMakerProject(ownerId, input);
  const stripped = stripCaptionMakerLocalPaths(project);
  const saved: CaptionProject = {
    ...(stripped as CaptionProject),
    updatedAt: new Date().toISOString(),
  };
  const payload = JSON.stringify(saved);
  if (Buffer.byteLength(payload, 'utf8') > 1_500_000) throw new Error('Project metadata exceeds 1.5 MB');
  const result = await d1Query<{ id: string }>(
    `INSERT INTO project_documents (kind, id, owner_user_id, payload, updated_at)
     VALUES ('reel-maker', ?, ?, ?, ?)
     ON CONFLICT(kind, id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
     WHERE project_documents.owner_user_id = excluded.owner_user_id
     RETURNING id`,
    [saved.id, ownerId, payload, saved.updatedAt],
  );
  if (!result.success || result.results.length !== 1) throw new Error('Reel Maker project save failed or belongs to another account');
  return saved;
}

export async function getReelMakerDocument(ownerId: string, id: string): Promise<CaptionProject | null> {
  validateIdentity(ownerId, id);
  const result = await d1Query<{ payload: string }>(
    `SELECT payload FROM project_documents WHERE kind = 'reel-maker' AND id = ? AND owner_user_id = ? LIMIT 1`,
    [id, ownerId],
  );
  if (!result.success) throw new Error('Unable to load Reel Maker project');
  if (!result.results[0]) return null;
  return validateReelMakerProject(ownerId, JSON.parse(result.results[0].payload));
}

export async function listReelMakerDocuments(ownerId: string): Promise<CaptionProject[]> {
  validateIdentity(ownerId);
  const result = await d1Query<{ payload: string }>(
    `SELECT payload FROM project_documents WHERE kind = 'reel-maker' AND owner_user_id = ? ORDER BY updated_at DESC LIMIT 50`,
    [ownerId],
  );
  if (!result.success) throw new Error('Unable to list Reel Maker projects');
  return result.results.map(row => validateReelMakerProject(ownerId, JSON.parse(row.payload)));
}

/** Persist Clip Finder manifests in D1 so ephemeral hosts can recover project state. */
export async function saveClipFinderDocument(ownerId: string, input: unknown): Promise<Project> {
  const project = validateClipFinderProject(ownerId, input);
  project.updatedAt = new Date().toISOString();
  const payload = JSON.stringify(project);
  if (Buffer.byteLength(payload, 'utf8') > 1_500_000) throw new Error('Project metadata exceeds 1.5 MB');
  const result = await d1Query<{ id: string }>(
    `INSERT INTO project_documents (kind, id, owner_user_id, payload, updated_at)
     SELECT 'clip-finder', ?, ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM deleted_clip_finder_projects WHERE project_id = ?)
     ON CONFLICT(kind, id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
     WHERE project_documents.owner_user_id = excluded.owner_user_id
     RETURNING id`,
    [project.id, ownerId, payload, project.updatedAt, project.id],
  );
  if (!result.success || result.results.length !== 1) throw new Error('Project metadata save failed or project was deleted');
  return project;
}

export async function getClipFinderDocument(ownerId: string, id: string): Promise<Project | null> {
  validateIdentity(ownerId, id);
  const result = await d1Query<{ payload: string }>(
    `SELECT payload FROM project_documents d
     WHERE d.kind = 'clip-finder' AND d.id = ? AND d.owner_user_id = ?
       AND NOT EXISTS (SELECT 1 FROM deleted_clip_finder_projects x WHERE x.project_id = d.id)
     LIMIT 1`,
    [id, ownerId],
  );
  if (!result.success) throw new Error('Unable to load cloud project metadata');
  if (!result.results[0]) return null;
  return validateClipFinderProject(ownerId, JSON.parse(result.results[0].payload));
}

export async function loadClipFinderDocument(id: string): Promise<Project | null> {
  validateIdentity('system-read', id);
  const result = await d1Query<{ payload: string; owner_user_id: string }>(
    `SELECT d.payload, d.owner_user_id FROM project_documents d
     WHERE d.kind = 'clip-finder' AND d.id = ?
       AND NOT EXISTS (SELECT 1 FROM deleted_clip_finder_projects x WHERE x.project_id = d.id)
     LIMIT 1`,
    [id],
  );
  if (!result.success) throw new Error('Unable to load cloud project metadata');
  if (!result.results[0]) return null;
  return validateClipFinderProject(result.results[0].owner_user_id, JSON.parse(result.results[0].payload));
}

export async function clipFinderProjectDeleted(id: string): Promise<boolean> {
  if (!projectCloudEnabled()) return false;
  const result = await d1Query('SELECT project_id FROM deleted_clip_finder_projects WHERE project_id = ? LIMIT 1', [id]);
  if (!result.success) throw new Error('Project deletion state unavailable');
  return result.results.length > 0;
}

export async function listClipFinderDocuments(ownerId?: string): Promise<Project[]> {
  if (!projectCloudEnabled()) throw new Error('Cloud project metadata is not enabled');
  const result = await d1Query<{ payload: string; owner_user_id: string }>(
    `SELECT d.payload, d.owner_user_id FROM project_documents d
     WHERE d.kind = 'clip-finder'
       ${ownerId ? 'AND d.owner_user_id = ?' : ''}
       AND NOT EXISTS (SELECT 1 FROM deleted_clip_finder_projects x WHERE x.project_id = d.id)
     ORDER BY d.updated_at DESC`,
    ownerId ? [ownerId] : [],
  );
  if (!result.success) throw new Error('Unable to list cloud projects');
  return result.results.map(row => validateClipFinderProject(row.owner_user_id, JSON.parse(row.payload)));
}

export async function deleteClipFinderDocument(ownerId: string, id: string): Promise<void> {
  validateIdentity(ownerId, id);
  const result = await d1Query("DELETE FROM project_documents WHERE kind = 'clip-finder' AND id = ? AND owner_user_id = ?", [id, ownerId]);
  if (!result.success) throw new Error('Unable to delete cloud project metadata');
}

function validateIdentity(ownerId: string, id?: string): void {
  if (!ownerId || (id !== undefined && !/^[a-zA-Z0-9_-]{1,160}$/.test(id))) throw new Error('Invalid project identity');
  if (!projectCloudEnabled()) throw new Error('Cloud project metadata is not enabled');
}

export async function saveClippingDocument(ownerId: string, input: unknown): Promise<ClippingProject> {
  const project = ClippingProjectSchema.parse(input);
  validateIdentity(ownerId, project.id);
  project.updatedAt = new Date().toISOString();
  const payload = JSON.stringify(mapClippingStorage(project, 'save'));
  if (Buffer.byteLength(payload, 'utf8') > 1_500_000) throw new Error('Project metadata exceeds 1.5 MB');
  // Conflict updates are tenant-checked atomically, including concurrent first saves.
  const result = await d1Query<{ id: string }>(
    `INSERT INTO project_documents (kind, id, owner_user_id, payload, updated_at)
     ${mediaLifecycleEnabled() ? "SELECT 'clipping', ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM deleted_clipping_projects WHERE project_id = ?)" : "VALUES ('clipping', ?, ?, ?, ?)"}
     ON CONFLICT(kind, id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
     WHERE project_documents.owner_user_id = excluded.owner_user_id
     RETURNING id`, [project.id, ownerId, payload, project.updatedAt, ...(mediaLifecycleEnabled() ? [project.id] : [])]
  );
  if (!result.success || result.results.length !== 1) throw new Error('Project ownership conflict');
  return project;
}

export async function listClippingDocuments(ownerId: string): Promise<ClippingProject[]> {
  validateIdentity(ownerId);
  const result = await d1Query<{ payload: string }>(
    `SELECT payload FROM project_documents WHERE kind = 'clipping' AND owner_user_id = ?
     ${mediaLifecycleEnabled() ? 'AND NOT EXISTS (SELECT 1 FROM deleted_clipping_projects d WHERE d.project_id = project_documents.id)' : ''}
     ORDER BY updated_at DESC`, [ownerId]
  );
  if (!result.success) throw new Error('Unable to load cloud project metadata');
  // Treat malformed cloud data as failure rather than silently discarding records.
  return result.results.map(row => mapClippingStorage(ClippingProjectSchema.parse(JSON.parse(row.payload)), 'load'));
}

export async function deleteClippingDocument(ownerId: string, id: string): Promise<void> {
  validateIdentity(ownerId, id);
  const result = await d1Query("DELETE FROM project_documents WHERE kind = 'clipping' AND id = ? AND owner_user_id = ?", [id, ownerId]);
  if (!result.success) throw new Error('Unable to delete cloud project metadata');
}
