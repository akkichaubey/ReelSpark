import { NextResponse, type NextRequest } from 'next/server';

/**
 * ReelSpark stores user media and a configurable Gemini key locally. Keep that
 * surface local by default; deployments that provide their own authentication
 * can deliberately opt in to remote access with REELSPARK_ALLOW_REMOTE=true.
 */
export function proxy(request: NextRequest) {
  if (process.env.REELSPARK_ALLOW_REMOTE === 'true') {
    return NextResponse.next();
  }

  const rawHost = (request.headers.get('host') || '').toLowerCase();
  const host = rawHost.startsWith('[') ? rawHost.slice(1, rawHost.indexOf(']')) : rawHost.split(':')[0];
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!isLocal) {
    return new NextResponse('ReelMaker is configured for local use only.', { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: '/:path*' };
