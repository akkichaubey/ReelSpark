import path from 'node:path';
import { APP_CONFIG } from '../config';
import { assertSafePath } from '../storage';
import type { ClippingProject } from '../clipping-studio/contracts';

const PREFIX = 'reelspark-storage:';

function resolveReference(relative: string, root: string): string {
  const parts = relative.replace(/\\/g, '/').split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.includes(':')) ||
      !(parts[0] === 'caption-maker' || (parts[0] === 'clipping-studio' && parts[1] === 'projects') ||
        (parts[0] === 'projects' && /^[a-zA-Z0-9_-]{1,160}$/.test(parts[1] || '') && parts.length >= 3))) {
    throw new Error('Invalid cloud storage reference');
  }
  return assertSafePath(path.join(root, ...parts), root);
}

export function toStorageReference(filename: string, root = APP_CONFIG.storageRoot): string {
  if (filename.startsWith(PREFIX)) { resolveReference(filename.slice(PREFIX.length), root); return filename; }
  const relative = path.relative(root, assertSafePath(path.resolve(filename), root)).split(path.sep).join('/');
  resolveReference(relative, root);
  return PREFIX + relative;
}

export function fromStorageReference(filename: string, root = APP_CONFIG.storageRoot): string {
  if (filename.startsWith(PREFIX)) return resolveReference(filename.slice(PREFIX.length), root);
  // Backward compatibility for snapshots from the default Windows/Linux storage directory.
  // Rebinding a path does not grant access: media APIs still check catalog ownership.
  const legacy = filename.replace(/\\/g, '/').match(/(?:^|\/)storage\/((?:clipping-studio\/projects|caption-maker|projects)\/.+)$/);
  return legacy ? resolveReference(legacy[1], root) : filename;
}

export function mapClippingStorage(project: ClippingProject, direction: 'save' | 'load'): ClippingProject {
  const map = direction === 'save' ? toStorageReference : fromStorageReference;
  return {
    ...project,
    mediaAssets: project.mediaAssets.map(asset => ({ ...asset, localPath: map(asset.localPath) })),
    exportJobs: project.exportJobs.map(job => ({ ...job, outputPath: job.outputPath ? map(job.outputPath) : undefined })),
  };
}
