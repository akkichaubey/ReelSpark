import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser as getAuthUser } from '@/lib/auth';
import {
  getSocialLinkPreferences,
  saveSocialLinkPreferences,
} from '@/lib/social-intelligence/storage';


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
