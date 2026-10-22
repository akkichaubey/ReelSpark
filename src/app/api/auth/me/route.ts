import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const sessionToken = req.cookies.get('reelspark_session')?.value;
    if (!sessionToken) {
      return NextResponse.json({ authenticated: false, user: null });
    }

    const user = await validateSession(sessionToken);
    if (!user) {
      return NextResponse.json({ authenticated: false, user: null });
    }

    return NextResponse.json({
      authenticated: true,
      user,
    });
  } catch (err: any) {
    console.error('[API Auth Me Error]', err);
    return NextResponse.json({ authenticated: false, user: null });
  }
}
