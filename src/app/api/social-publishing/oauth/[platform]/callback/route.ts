import { runtimeOrigin } from '@/lib/runtime-origin';
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { exchangeOAuthCode } from '@/lib/social-intelligence/oauth-manager';
import { consumeOAuthState, oauthStateCookie, publishingPlatforms } from '@/lib/social-intelligence/oauth-state';
import { PublishingPlatformKey } from '@/lib/social-intelligence/publishing-types';

export async function GET(req: NextRequest, context: { params: Promise<{ platform: string }> }) {
  const { platform } = await context.params;
  let origin: string;
  try { origin = runtimeOrigin(req.url); }
  catch { return NextResponse.json({ success: false, error: 'Publishing origin is not configured.' }, { status: 503 }); }
  let returnTo = '/social-post?tab=accounts';
  let response: NextResponse;
  try {
    if (!publishingPlatforms.includes(platform as PublishingPlatformKey)) throw new Error('Invalid platform');
    const user = await getRequestUser(req);
    if (!user) throw new Error('Sign in before connecting your account.');
    returnTo = consumeOAuthState(req.cookies.get(oauthStateCookie(platform))?.value, req.nextUrl.searchParams.get('state'), user.id, platform);
    if (req.nextUrl.searchParams.has('error')) throw new Error('Authorization declined');
    const code = req.nextUrl.searchParams.get('code');
    if (!code) throw new Error('Missing authorization code');
    await exchangeOAuthCode(platform as PublishingPlatformKey, code, origin, user.id);
    const url = new URL(returnTo, origin);
    url.searchParams.set('oauth_success', platform);
    response = NextResponse.redirect(url);
  } catch {
    const url = new URL(returnTo, origin);
    url.searchParams.set('oauth_error', 'Connection could not be verified. Please sign in and reconnect.');
    response = NextResponse.redirect(url);
  }
  response.cookies.set(oauthStateCookie(platform), '', { httpOnly: true, sameSite: 'lax', secure: new URL(origin).protocol === 'https:', path: '/api/social-publishing/oauth/' + platform + '/callback', maxAge: 0 });
  return response;
}
