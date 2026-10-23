import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import {
  getSocialLinkPreferences,
  saveSocialLinkPreferences,
} from '@/lib/social-intelligence/storage';

async function getAuthUser(req: NextRequest | Request) {
  const cookieHeader = req.headers?.get?.('cookie');
  const token =
    (req as any).cookies?.get?.('reelspark_session')?.value ||
    cookieHeader?.match(/reelspark_session=([^;]+)/)?.[1] ||
    req.headers?.get?.('authorization')?.replace('Bearer ', '');
  if (!token) {
    if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEMO_LOGIN === 'true') {
      return { id: 'usr_admin', name: 'Administrator', email: 'admin@reelspark.ai' };
    }
    return null;
  }
  return await validateSession(token);
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const preferences = await getSocialLinkPreferences(user.id);
    return NextResponse.json({ success: true, preferences });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const updated = await saveSocialLinkPreferences(user.id, body);

    return NextResponse.json({ success: true, preferences: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
