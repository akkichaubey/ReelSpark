import { NextRequest, NextResponse } from 'next/server';
import { registerUser, loginUser, isSameOriginAuthRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  if (!isSameOriginAuthRequest(req)) return NextResponse.json({ success: false, error: 'Invalid request origin' }, { status: 403 });
  try {
    const body = await req.json();
    const { name, email, password } = body;
    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ success: false, error: 'Name, email, and password are required' }, { status: 400 });
    }

    const result = await registerUser({ name, email, password });
    if (result.error || !result.user) {
      return NextResponse.json({ success: false, error: result.error || 'Registration failed' }, { status: 400 });
    }

    // Auto-login after registration
    const loginResult = await loginUser({ email, password });
    if (!loginResult.token) {
      return NextResponse.json({ success: false, error: 'Account created, but sign-in failed. Please sign in again.' }, { status: 503 });
    }

    const response = NextResponse.json({
      success: true,
      user: result.user,
      message: 'Account created successfully',
    });

    if (loginResult.token) {
      response.cookies.set('reelspark_session', loginResult.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });
    }

    return response;
  } catch (err: any) {
    console.error('[API Register Error]', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}
