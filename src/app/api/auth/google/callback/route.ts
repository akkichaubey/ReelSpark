import { NextRequest, NextResponse } from 'next/server';
import { destroySession, signInGoogleUser } from '@/lib/auth';
import { exchangeGoogleCode, getAuthOrigin, GOOGLE_FLOW_COOKIE, isGoogleConfigured, readGoogleFlow, safeReturnTo } from '@/lib/google-auth';

export async function GET(req: NextRequest) {
  let origin: string;
  try { origin = getAuthOrigin(req.url); }
  catch { return NextResponse.json({ success: false, error: 'Google sign-in configuration is unavailable.' }, { status: 503 }); }

  const flow = readGoogleFlow(req.cookies.get(GOOGLE_FLOW_COOKIE)?.value, req.nextUrl.searchParams.get('state'));
  const target = new URL(safeReturnTo(flow?.returnTo, origin), origin);
  let sessionToken: string | undefined;
  try {
    if (!flow) target.searchParams.set('auth_error', 'google_invalid_state');
    else if (req.nextUrl.searchParams.has('error')) target.searchParams.set('auth_error', 'google_cancelled');
    else if (!isGoogleConfigured()) target.searchParams.set('auth_error', 'google_not_configured');
    else {
      const code = req.nextUrl.searchParams.get('code');
      if (!code) throw new Error('Missing authorization code');
      const identity = await exchangeGoogleCode(code, flow, origin);
      const result = await signInGoogleUser(identity);
      if (result.error || !result.token) target.searchParams.set('auth_error', result.error || 'google_failed');
      else {
        sessionToken = result.token;
        const previous = req.cookies.get('reelspark_session')?.value;
        if (previous) await destroySession(previous);
        target.searchParams.delete('auth_error');
      }
    }
  } catch {
    target.searchParams.set('auth_error', 'google_failed');
  }
  const response = NextResponse.redirect(target, 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.cookies.set(GOOGLE_FLOW_COOKIE, '', {
    httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'lax', path: '/api/auth/google', maxAge: 0,
  });
  if (sessionToken) response.cookies.set('reelspark_session', sessionToken, {
    httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
