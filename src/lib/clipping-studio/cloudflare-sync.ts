import type { ClippingProject } from './contracts';

// Browser-safe facade: credentials and SQL stay on the server.
export interface CloudflareConfigStatus {
  configured: boolean;
  accountId: boolean;
  databaseId: boolean;
  apiToken: boolean;
  message: string;
}

let status: CloudflareConfigStatus = {
  configured: false, accountId: false, databaseId: false, apiToken: false,
  message: 'Cloud project metadata has not been checked.',
};
let deletedIds = new Set<string>();
export function getDeletedCloudProjectIds(): ReadonlySet<string> { return new Set(deletedIds); }

export function getCloudflareStatus(): CloudflareConfigStatus { return status; }

export async function syncProjectToCloudflare(project: ClippingProject): Promise<{ success: boolean; synced: boolean; message?: string }> {
  try {
    const response = await fetch('/api/clipping-studio/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project), signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok || !data.success) return { success: false, synced: false, message: data.error || 'Cloud metadata save failed' };
    return { success: true, synced: data.synced === true, message: data.message };
  } catch {
    return { success: false, synced: false, message: 'Cloud metadata unavailable; local cache is unchanged.' };
  }
}

export async function loadProjectsFromCloudflare(): Promise<ClippingProject[]> {
  const response = await fetch('/api/clipping-studio/projects', {
    cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || 'Cloud metadata unavailable');
  const enabled = data.enabled === true;
  deletedIds = new Set(Array.isArray(data.deletedProjectIds) ? data.deletedProjectIds.filter((id: unknown) => typeof id === 'string') : []);
  status = {
    configured: enabled, accountId: enabled, databaseId: enabled, apiToken: enabled,
    message: enabled ? 'D1 metadata loaded. Media durability is not enabled.' : data.message,
  };
  return data.projects || [];
}

export async function deleteProjectFromCloudflare(projectId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/clipping-studio/projects?id=${encodeURIComponent(projectId)}`, { method: 'DELETE' });
    const data = await response.json();
    return response.ok && data.success === true;
  } catch { return false; }
}
