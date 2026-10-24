import { NextRequest, NextResponse } from 'next/server';
import { destroySession, isSameOriginAuthRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  if (!isSameOriginAuthRequest(req)) return NextResponse.json({ success: false, error: 'Invalid request origin' }, { status: 403 });
  try {
    const sessionCookie = req.cookies.get('reelspark_session')?.value;
    if (sessionCookie) {
      if (!await destroySession(sessionCookie)) {
        return NextResponse.json({ success: false, error: 'Could not end your session. Please try again.' }, { status: 503 });
      }
    }

    const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
    response.cookies.delete('reelspark_session');
    return response;
  } catch (err: any) {
    console.error('[API Logout Error]', err);
    return NextResponse.json({ success: false, error: err.message || 'Logout failed' }, { status: 500 });
  }
}
