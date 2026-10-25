import { runtimeOrigin } from '@/lib/runtime-origin';
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, isSameOriginAuthRequest } from '@/lib/auth';
import {
  getResolvedOAuthCredentials,
  saveStoredOAuthCredentials,
  readStoredOAuthCredentials,
} from '@/lib/social-intelligence/oauth-config';
import { PublishingPlatformKey } from '@/lib/social-intelligence/publishing-types';

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const origin = runtimeOrigin(req.url);
    const platforms: PublishingPlatformKey[] = ['youtube', 'instagram', 'facebook', 'threads'];

    const configStatus = platforms.map((platform) => {
      const creds = getResolvedOAuthCredentials(platform);
      const redirectUri = `${origin}/api/social-publishing/oauth/${platform}/callback`;

      return {
        platform,
        isConfigured: creds.isConfigured,
        source: creds.source,
        clientIdMasked: creds.clientId
          ? `${creds.clientId.substring(0, 8)}...${creds.clientId.slice(-4)}`
          : undefined,
        redirectUri,
      };
    });

    return NextResponse.json({ success: true, platforms: configStatus, origin, canConfigure: user.role === 'admin' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isSameOriginAuthRequest(req)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') return NextResponse.json({ success: false, error: 'Only administrators can configure developer credentials.' }, { status: 403 });
    const body = await req.json();
    const { platform, clientId, clientSecret } = body;

    const validPlatforms: PublishingPlatformKey[] = ['youtube', 'instagram', 'facebook', 'threads'];
    if (!validPlatforms.includes(platform)) {
      return NextResponse.json({ success: false, error: 'Invalid platform' }, { status: 400 });
    }

    if (typeof clientId !== 'string' || typeof clientSecret !== 'string' || !clientId.trim() || !clientSecret.trim()) {
      return NextResponse.json(
        { success: false, error: 'Both App/Client ID and App/Client Secret are required' },
        { status: 400 }
      );
    }

    // Save developer credentials
    saveStoredOAuthCredentials(platform, {
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
    });

    // Also mirror to Facebook/Instagram if Meta app ID is set
    if (platform === 'facebook' || platform === 'instagram') {
      saveStoredOAuthCredentials('facebook', { clientId: clientId.trim(), clientSecret: clientSecret.trim() });
      saveStoredOAuthCredentials('instagram', { clientId: clientId.trim(), clientSecret: clientSecret.trim() });
    }

    return NextResponse.json({
      success: true,
      message: `Developer credentials saved for ${platform}. You can now connect your official account.`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
