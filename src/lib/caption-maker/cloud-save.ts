/** Disabled cloud storage is a supported local-only mode, never a synced save. */
export async function readCloudSaveResult(response: Response): Promise<'saved' | 'local'> {
  const result = await response.json().catch(() => null);
  if (response.ok && result?.enabled === false && result?.synced === false && result?.code === 'CLOUD_STORAGE_DISABLED') return 'local';
  if (!response.ok || result?.synced !== true) throw new Error(result?.error || 'Cloud save failed. This project is saved only in this browser.');
  return 'saved';
}
