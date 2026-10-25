import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, isSameOriginAuthRequest } from '@/lib/auth';
import { cancelStorageTask } from '@/lib/storage-runtime';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  if (!isSameOriginAuthRequest(req)) return NextResponse.json({ success: false, error: 'Invalid request origin' }, { status: 403 });
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(id)) return NextResponse.json({ success: false, error: 'Invalid upload ID' }, { status: 400 });

  try {
    const result = await cancelStorageTask(id, user.id);
    if (result === 'not-found') return NextResponse.json({ success: false, error: 'Upload is no longer active' }, { status: 404 });
    if (result === 'timeout') return NextResponse.json({ success: false, error: 'Upload cancellation is still being finalized' }, { status: 202 });
    return NextResponse.json({ success: true, cancelled: true });
  } catch (error) {
    console.error('[Storage upload cancellation] Failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Unable to cancel this upload right now' }, { status: 500 });
  }
}
