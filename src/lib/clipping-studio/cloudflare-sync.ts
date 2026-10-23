/**
 * Cloudflare D1 — Clipping Studio Project Sync
 *
 * Synchronizes clipping projects, media assets, and clips to Cloudflare D1.
 * Falls back gracefully to local-only mode when D1 is not configured.
 */

import { d1Query, getD1Status } from '../cloudflare/d1';

export interface CloudflareConfigStatus {
  configured: boolean;
  accountId: boolean;
  databaseId: boolean;
  apiToken: boolean;
  message: string;
}

/**
 * Returns configuration status of Cloudflare D1 without throwing errors.
 */
export function getCloudflareStatus(): CloudflareConfigStatus {
  return getD1Status();
}

/**
 * Synchronizes a clipping project and its child entities to Cloudflare D1.
 * Fails safely without throwing if offline or unconfigured.
 */
export async function syncProjectToCloudflare(
  project: any
): Promise<{ success: boolean; synced: boolean; message?: string }> {
  const status = getD1Status();
  if (!status.configured) {
    return { success: true, synced: false, message: 'Cloudflare D1 not configured; project preserved locally.' };
  }

  try {
    // 1. Upsert clipping project
    await d1Query(
      `INSERT INTO clipping_projects (id, name, description, settings, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         settings = excluded.settings,
         updated_at = excluded.updated_at`,
      [
        project.id,
        project.name || 'Untitled',
        project.description || '',
        JSON.stringify({}),
        new Date().toISOString(),
      ]
    );

    // 2. Upsert media assets
    if (Array.isArray(project.mediaAssets) && project.mediaAssets.length > 0) {
      for (const asset of project.mediaAssets) {
        try {
          await d1Query(
            `INSERT INTO media_assets (id, project_id, filename, r2_key, local_path, file_size_bytes, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               filename = excluded.filename,
               r2_key = excluded.r2_key,
               local_path = excluded.local_path,
               file_size_bytes = excluded.file_size_bytes,
               metadata = excluded.metadata`,
            [
              asset.id,
              project.id,
              asset.filename || '',
              asset.r2Key || null,
              asset.localPath || null,
              asset.fileSizeBytes || 0,
              JSON.stringify(asset.metadata || {}),
            ]
          );
        } catch (err: any) {
          console.warn(`[D1 Sync] Failed to sync media asset ${asset.id}:`, err.message);
        }
      }
    }

    // 3. Upsert clips
    if (Array.isArray(project.clips) && project.clips.length > 0) {
      for (const clip of project.clips) {
        try {
          await d1Query(
            `INSERT INTO clips (id, project_id, media_asset_id, name, start_ms, end_ms, duration_ms, order_index, notes, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               media_asset_id = excluded.media_asset_id,
               name = excluded.name,
               start_ms = excluded.start_ms,
               end_ms = excluded.end_ms,
               duration_ms = excluded.duration_ms,
               order_index = excluded.order_index,
               notes = excluded.notes,
               updated_at = excluded.updated_at`,
            [
              clip.id,
              project.id,
              clip.mediaAssetId || null,
              clip.name || 'Clip',
              clip.startMs || 0,
              clip.endMs || 0,
              clip.durationMs || 0,
              clip.orderIndex || 0,
              clip.notes || null,
              new Date().toISOString(),
            ]
          );
        } catch (err: any) {
          console.warn(`[D1 Sync] Failed to sync clip ${clip.id}:`, err.message);
        }
      }
    }

    return { success: true, synced: true, message: 'Synchronized to Cloudflare D1' };
  } catch (err: any) {
    console.error('[D1 Sync] Error:', err.message);
    return {
      success: false,
      synced: false,
      message: err.message || 'Cloudflare D1 sync failed; preserved locally',
    };
  }
}

/**
 * Load all clipping projects from Cloudflare D1.
 */
export async function loadProjectsFromCloudflare(): Promise<any[]> {
  const status = getD1Status();
  if (!status.configured) return [];

  try {
    const result = await d1Query<{
      id: string;
      name: string;
      description: string;
      settings: string;
      created_at: string;
      updated_at: string;
    }>('SELECT * FROM clipping_projects ORDER BY updated_at DESC');

    return result.results.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      settings: JSON.parse(row.settings || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      mediaAssets: [],
      clips: [],
    }));
  } catch (err: any) {
    console.error('[D1] loadProjectsFromCloudflare failed:', err.message);
    return [];
  }
}

/**
 * Delete a clipping project and all its children from Cloudflare D1.
 */
export async function deleteProjectFromCloudflare(projectId: string): Promise<boolean> {
  const status = getD1Status();
  if (!status.configured) return false;

  try {
    // CASCADE DELETE handles children (media_assets, clips)
    await d1Query('DELETE FROM clipping_projects WHERE id = ?', [projectId]);
    return true;
  } catch (err: any) {
    console.error('[D1] deleteProjectFromCloudflare failed:', err.message);
    return false;
  }
}
