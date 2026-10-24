import { NextRequest, NextResponse } from 'next/server';
import { loginUser, isSameOriginAuthRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  if (!isSameOriginAuthRequest(req)) return NextResponse.json({ success: false, error: 'Invalid request origin' }, { status: 403 });
  try {
    const body = await req.json();
    const { email, password } = body;
    if (typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ success: false, error: 'Email and password are required' }, { status: 400 });
    }

    const result = await loginUser({ email, password });
    if (result.error || !result.user || !result.token) {
      return NextResponse.json({ success: false, error: result.error || 'Login failed' }, { status: 401 });
    }

    const response = NextResponse.json({
      success: true,
      user: result.user,
      message: 'Logged in successfully',
    });

    response.cookies.set('reelspark_session', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;
  } catch (err: any) {
    console.error('[API Login Error]', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}
