import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getOAuthConnections } from '@/lib/social-intelligence/storage';
import { toSafeOAuthConnection } from '@/lib/social-intelligence/oauth-manager';

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const connections = await getOAuthConnections(user.id);
    const safeConnections = connections.map(toSafeOAuthConnection);

    return NextResponse.json({ success: true, connections: safeConnections });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
