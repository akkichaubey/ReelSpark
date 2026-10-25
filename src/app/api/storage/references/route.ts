import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser, isSameOriginAuthRequest } from '@/lib/auth';
import { canReadMedia } from '@/lib/media-access';
import { normalizeManagedStorageReference, saveStorageReferences } from '@/lib/storage-references';
import { resolveStoragePath } from '@/lib/storage';

const schema = z.object({
  clientId: z.string().min(16).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  scope: z.enum(['caption-maker', 'clipping-studio']),
  complete: z.boolean(),
  references: z.array(z.string().min(1).max(2048)).max(1000),
  projectReferences: z.record(z.string(), z.array(z.string().min(1).max(2048)).max(1000))
    .refine((value) => Object.keys(value).length <= 100)
    .refine((value) => Object.values(value).reduce((total, paths) => total + paths.length, 0) <= 1000),
}).strict();

export async function PUT(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  if (!isSameOriginAuthRequest(req)) return NextResponse.json({ success: false, error: 'Invalid request origin' }, { status: 403 });
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid storage reference inventory' }, { status: 400 });
    for (const projectKey of Object.keys(parsed.data.projectReferences)) {
      if (!projectKey.startsWith(`${parsed.data.scope}:`) || !/^[a-zA-Z0-9_-]{1,160}$/.test(projectKey.slice(parsed.data.scope.length + 1))) {
        return NextResponse.json({ success: false, error: 'Invalid project reference inventory' }, { status: 400 });
      }
    }
    const allReferences = [
      ...parsed.data.references,
      ...Object.values(parsed.data.projectReferences).flat(),
    ];
    const references = [...new Set(allReferences.map(normalizeManagedStorageReference))];
    for (const reference of references) {
      if (!(await canReadMedia(user.id, resolveStoragePath(reference)))) {
        return NextResponse.json({ success: false, error: 'A referenced asset is not owned by this account' }, { status: 403 });
      }
    }
    const projectReferences = Object.fromEntries(Object.entries(parsed.data.projectReferences).map(([key, items]) => [
      key,
      [...new Set(items.map(normalizeManagedStorageReference))],
    ]));
    await saveStorageReferences(user.id, parsed.data.clientId, references, projectReferences, parsed.data.complete);
    return NextResponse.json({ success: true, referenceCount: references.length }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[Storage references] Sync failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Storage reference sync failed; cleanup will keep unknown assets' }, { status: 503 });
  }
}
