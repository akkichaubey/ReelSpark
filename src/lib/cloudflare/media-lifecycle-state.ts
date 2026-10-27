import { d1Query, getD1Status } from './d1';

export const mediaLifecycleEnabled = () => process.env.CLOUD_MEDIA_LIFECYCLE_ENABLED === 'true';

export async function clippingProjectDeleted(id: string): Promise<boolean> {
  if (process.env.CLOUD_PRIVATE_MEDIA_ENABLED === 'true' && getD1Status().configured) {
    try {
      const deletion = await d1Query("SELECT id FROM project_documents WHERE kind = 'deleted-clipping' AND id = ? LIMIT 1", [id]);
      if (!deletion.success) throw new Error('Project deletion state unavailable');
      if (deletion.results.length > 0) return true;
    } catch (error) {
      // Legacy private-media installations may predate the additive document table.
      if (!(error instanceof Error) || !/no such table:?\s+project_documents/i.test(error.message)) throw error;
    }
  }
  if (!mediaLifecycleEnabled()) return false;
  const result = await d1Query('SELECT project_id FROM deleted_clipping_projects WHERE project_id = ? LIMIT 1', [id]);
  if (!result.success) throw new Error('Project deletion state unavailable');
  return result.results.length > 0;
}
