'use client';

type ReferenceSource = unknown;

function getClientId(scope: 'caption-maker' | 'clipping-studio'): string {
  const key = `reelspark_storage_reference_client_${scope}`;
  let value = localStorage.getItem(key);
  if (!value) {
    value = `${scope.replace(/-/g, '')}_${crypto.randomUUID().replace(/-/g, '')}`;
    localStorage.setItem(key, value);
  }
  return value;
}

function collectReferences(source: ReferenceSource): string[] {
  const output = new Set<string>();
  const visited = new Set<object>();
  const visit = (value: unknown, key = '') => {
    if (typeof value === 'string') {
      if (/(?:path|url)$/i.test(key)) {
        const match = value.match(/\/api\/files\/([^?#]+)/);
        if (match) output.add(decodeURIComponent(match[1]));
        else if (value.startsWith('reelspark-storage:')) output.add(value);
        else if (/^(?:[A-Za-z]:[\\/]|\/)/.test(value)) output.add(value);
      }
      return;
    }
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) value.forEach((item) => visit(item, key));
    else Object.entries(value).forEach(([childKey, child]) => visit(child, childKey));
  };
  visit(source);
  return [...output];
}

function collectInventory(scope: 'caption-maker' | 'clipping-studio', sources: ReferenceSource[]) {
  const references = new Set<string>();
  const projectReferences: Record<string, string[]> = {};
  let complete = true;
  let projectedReferenceCount = 0;
  for (const source of sources) {
    const record = source && typeof source === 'object' ? source as Record<string, unknown> : {};
    const id = typeof record.id === 'string' ? record.id : typeof record.projectId === 'string' ? record.projectId : '';
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id)) complete = false;
    const paths = collectReferences(source);
    paths.forEach((item) => references.add(item));
    if (id) {
      const uniquePaths = [...new Set([...(projectReferences[`${scope}:${id}`] || []), ...paths])];
      const remaining = Math.max(0, 1000 - projectedReferenceCount);
      if (uniquePaths.length > remaining) complete = false;
      const bounded = uniquePaths.slice(0, remaining);
      projectReferences[`${scope}:${id}`] = bounded;
      projectedReferenceCount += bounded.length;
    }
  }
  const values = [...references];
  const capped = values.length > 1000;
  const projectEntries = Object.entries(projectReferences);
  if (projectEntries.length > 100) complete = false;
  const boundedProjectReferences = Object.fromEntries(projectEntries.slice(0, 100).map(([key, paths]) => [key, paths]));
  return {
    references: values.slice(0, 1000),
    projectReferences: boundedProjectReferences,
    complete: complete && !capped,
  };
}

export async function syncStorageReferenceInventory(
  scope: 'caption-maker' | 'clipping-studio',
  sources: ReferenceSource[],
): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const inventory = collectInventory(scope, sources);
    await fetch('/api/storage/references', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: getClientId(scope), scope, ...inventory }),
      credentials: 'same-origin',
      keepalive: true,
    });
  } catch {
    // A failed reference sync fails closed: the server janitor retains unknown assets.
  }
}
