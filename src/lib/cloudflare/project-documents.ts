import { d1Query, getD1Status } from './d1';
import { ClippingProjectSchema, type ClippingProject } from '../clipping-studio/contracts';
import { mediaLifecycleEnabled } from './media-lifecycle-state';
import { mapClippingStorage } from './storage-references';

export function projectCloudEnabled(): boolean {
  return process.env.CLOUD_PROJECT_METADATA_ENABLED === 'true' && getD1Status().configured;
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
