import { NextRequest, NextResponse } from 'next/server';
import { getAuthOrigin, GOOGLE_FLOW_COOKIE, GOOGLE_FLOW_TTL, isGoogleConfigured, safeReturnTo, startGoogleFlow } from '@/lib/google-auth';

export async function GET(req: NextRequest) {
  try {
    const origin = getAuthOrigin(req.url);
    const returnTo = safeReturnTo(req.nextUrl.searchParams.get('next'), origin);
    if (!isGoogleConfigured()) {
      const target = new URL(returnTo, origin);
      target.searchParams.set('auth_error', 'google_not_configured');
      return NextResponse.redirect(target, 303);
    }
    const { authorizationUrl, cookieValue } = startGoogleFlow(origin, returnTo);
    const response = NextResponse.redirect(authorizationUrl, 303);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.cookies.set(GOOGLE_FLOW_COOKIE, cookieValue, {
      httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'lax',
      path: '/api/auth/google', maxAge: GOOGLE_FLOW_TTL,
    });
    return response;
  } catch {
    return NextResponse.json({ success: false, error: 'Google sign-in configuration is unavailable.' }, { status: 503 });
  }
}
