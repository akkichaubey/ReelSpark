import { d1Query } from './d1';

export const mediaLifecycleEnabled = () => process.env.CLOUD_MEDIA_LIFECYCLE_ENABLED === 'true';

export async function clippingProjectDeleted(id: string): Promise<boolean> {
  if (!mediaLifecycleEnabled()) return false;
  const result = await d1Query('SELECT project_id FROM deleted_clipping_projects WHERE project_id = ? LIMIT 1', [id]);
  if (!result.success) throw new Error('Project deletion state unavailable');
  return result.results.length > 0;
}
