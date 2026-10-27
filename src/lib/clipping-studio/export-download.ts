/** Map app-managed export files to the existing authenticated media route. */
export function getExportDownloadUrl(outputPath?: string): string | null {
  if (!outputPath) return null;
  const normalized = outputPath.replace(/\\/g, '/');
  const relative = normalized.startsWith('reelspark-storage:')
    ? normalized.slice('reelspark-storage:'.length)
    : normalized.match(/(?:^|\/)storage\/(clipping-studio\/projects\/[^/]+\/exports\/.+)$/)?.[1];
  if (!relative) return null;
  const parts = relative.split('/');
  if (parts.length < 5 || parts[0] !== 'clipping-studio' || parts[1] !== 'projects' || parts[3] !== 'exports' ||
      !/^[a-zA-Z0-9_-]{1,160}$/.test(parts[2]) || parts.some(part => !part || part === '.' || part === '..' || /[:?#]/.test(part)) ||
      !/\.(mp4|mov|webm|mp3|wav)$/i.test(parts.at(-1) || '')) return null;
  return `/api/files/${parts.map(encodeURIComponent).join('/')}`;
}
