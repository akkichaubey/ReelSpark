import { NextRequest, NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const sessionCookie = req.cookies.get('reelspark_session')?.value;
    if (sessionCookie) {
      await destroySession(sessionCookie);
    }

    const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
    response.cookies.delete('reelspark_session');
    return response;
  } catch (err: any) {
    console.error('[API Logout Error]', err);
    return NextResponse.json({ success: false, error: err.message || 'Logout failed' }, { status: 500 });
  }
}
