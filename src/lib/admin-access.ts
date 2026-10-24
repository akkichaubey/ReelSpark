import { NextResponse } from 'next/server';
import { requireMediaUser } from './media-api-access';

export async function requireAdmin(req: Request): Promise<NextResponse | null> {
  const access = await requireMediaUser(req);
  if (access.error) return access.error;
  if (access.user.role !== 'admin') return NextResponse.json({ success: false, error: 'Administrator access required for server settings' }, { status: 403 });
  return null;
}
