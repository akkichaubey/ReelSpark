import { runtimeOrigin } from '@/lib/runtime-origin';
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, isSameOriginAuthRequest } from '@/lib/auth';
import { retryPlatformPublish } from '@/lib/social-intelligence/publisher-dispatcher';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    if (!isSameOriginAuthRequest(req)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json();
    const recordId = body.recordId || id;

    const origin = runtimeOrigin(req.url);
    await retryPlatformPublish(user.id, origin, recordId);

    return NextResponse.json({ success: true, message: 'Retry initiated' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
