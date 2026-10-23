import { NextRequest, NextResponse } from 'next/server';
import { registerUser, loginUser } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, password } = body;

    const result = await registerUser({ name, email, password });
    if (result.error || !result.user) {
      return NextResponse.json({ success: false, error: result.error || 'Registration failed' }, { status: 400 });
    }

    // Auto-login after registration
    const loginResult = await loginUser({ email, password });

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
