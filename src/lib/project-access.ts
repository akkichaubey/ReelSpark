import { NextResponse } from 'next/server';
import { getRequestUser, isSameOriginAuthRequest, type UserProfile } from './auth';
import { loadProject } from './storage';
import type { Project } from './types';

export function ownsProject(user: UserProfile, project: Project): boolean {
  // Legacy ownerless projects are not silently assigned to the next visitor.
  return project.ownerUserId === user.id;
}

export async function requireProjectAccess(req: Request, id: string): Promise<NextResponse | null> {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  if (!['GET', 'HEAD'].includes(req.method) && !isSameOriginAuthRequest(req)) {
    return NextResponse.json({ success: false, error: 'Invalid request origin' }, { status: 403 });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
  }
  const project = await loadProject(id);
  if (!project || !ownsProject(user, project)) {
    return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
  }
  return null;
}
