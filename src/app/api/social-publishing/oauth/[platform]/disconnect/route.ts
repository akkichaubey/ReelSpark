import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, isSameOriginAuthRequest } from '@/lib/auth';
import { deleteOAuthConnection } from '@/lib/social-intelligence/storage';
import { PublishingPlatformKey } from '@/lib/social-intelligence/publishing-types';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ platform: string }> }
) {
  try {
    if (!isSameOriginAuthRequest(req)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { platform } = await context.params;
    const validPlatforms: PublishingPlatformKey[] = ['youtube', 'instagram', 'facebook', 'threads'];
    if (!validPlatforms.includes(platform as any)) {
      return NextResponse.json({ success: false, error: 'Invalid platform' }, { status: 400 });
    }

    await deleteOAuthConnection(user.id, platform as PublishingPlatformKey);
    return NextResponse.json({ success: true, message: `Disconnected from ${platform}` });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
