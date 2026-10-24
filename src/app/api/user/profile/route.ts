import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser as getAuthUser } from '@/lib/auth';
import { getUserProfile, saveUserProfile } from '@/lib/social-intelligence/storage';


export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await getUserProfile(user.id);
    return NextResponse.json({
      success: true,
      profile: {
        ...profile,
        name: profile?.name || user.name,
        email: profile?.email || user.email,
      },
    });
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
    const updated = await saveUserProfile(user.id, body);

    return NextResponse.json({
      success: true,
      profile: updated,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
