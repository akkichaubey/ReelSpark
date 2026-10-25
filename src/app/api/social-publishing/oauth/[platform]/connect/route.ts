import { runtimeOrigin } from '@/lib/runtime-origin';
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { buildOAuthAuthorizationUrl } from '@/lib/social-intelligence/oauth-manager';
import { PublishingPlatformKey } from '@/lib/social-intelligence/publishing-types';
import { createOAuthState, oauthStateCookie, safeOAuthReturnTo } from '@/lib/social-intelligence/oauth-state';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ platform: string }> }
) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { platform } = await context.params;
    const validPlatforms: PublishingPlatformKey[] = ['youtube', 'instagram', 'facebook', 'threads'];
    if (!validPlatforms.includes(platform as any)) {
      return NextResponse.json({ success: false, error: 'Invalid platform' }, { status: 400 });
    }

    const origin = runtimeOrigin(req.url);
    const returnTo = safeOAuthReturnTo(req.nextUrl.searchParams.get('returnTo'));
    const { state: statePayload, cookie } = createOAuthState(user.id, platform as PublishingPlatformKey, returnTo);

    const authUrl = buildOAuthAuthorizationUrl(platform as PublishingPlatformKey, origin, statePayload);

    // Return JSON URL if called via AJAX or redirect directly if browser navigation
    const response = req.headers.get('accept')?.includes('application/json')
      ? NextResponse.json({ success: true, url: authUrl }) : NextResponse.redirect(authUrl);
    response.cookies.set(oauthStateCookie(platform), cookie, { httpOnly: true, secure: new URL(origin).protocol === 'https:', sameSite: 'lax', path: `/api/social-publishing/oauth/${platform}/callback`, maxAge: 600 });
    return response;
  } catch (err: any) {
    const returnTo = safeOAuthReturnTo(req.nextUrl.searchParams.get('returnTo'));
    if (req.headers.get('accept')?.includes('application/json')) {
      return NextResponse.json({ success: false, error: err.message, requiresCredentials: true }, { status: 400 });
    }
    let origin: string;
    try { origin = runtimeOrigin(req.url); }
    catch { return NextResponse.json({ success: false, error: 'Publishing origin is not configured.' }, { status: 503 }); }
    const errUrl = new URL(returnTo, origin);
    errUrl.searchParams.set('oauth_error', err.message);
    const { platform } = await context.params;
    errUrl.searchParams.set('config_platform', platform);
    return NextResponse.redirect(errUrl);
  }
}
