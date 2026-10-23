import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import {
  updateSocialAccount,
  deleteSocialAccount,
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    const result = await updateSocialAccount(user.id, id, body);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, account: result.account });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const result = await deleteSocialAccount(user.id, id);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
