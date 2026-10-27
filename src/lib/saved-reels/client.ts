import type { CaptionProject } from '../caption-maker/types';
import type { SavedReel } from './types';

export async function saveReel(
  project: CaptionProject,
  options: {
    id?: string;
    revision?: number;
    originProjectId?: string;
    originProjectName?: string;
  } = {}
): Promise<SavedReel> {
  const response = await fetch('/api/saved-reels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, ...options }),
  });
  const data = await response.json();
  if (!response.ok || !data.success)
    throw new Error(data.error || 'Could not save reel');
  return data.reel;
}
