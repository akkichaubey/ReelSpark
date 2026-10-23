import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import {
  getSocialAccounts,
  addSocialAccount,
} from '@/lib/social-intelligence/storage';
import { isRecognizedPlatform } from '@/lib/social-intelligence/platform-rules';

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

    const accounts = await getSocialAccounts(user.id);
    return NextResponse.json({ success: true, accounts });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { platform, accountUrl, displayName, isPrimary } = body;

    if (!platform || !isRecognizedPlatform(platform)) {
      return NextResponse.json(
        { success: false, error: 'Invalid or unsupported platform selected' },
        { status: 400 }
      );
    }

    if (!accountUrl || typeof accountUrl !== 'string' || accountUrl.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Account URL is required' },
        { status: 400 }
      );
    }

    const result = await addSocialAccount(user.id, {
      platform,
      accountUrl,
      displayName,
      isPrimary,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, account: result.account }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
