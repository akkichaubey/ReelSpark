import { NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { publishingRuntimeStatus } from '@/lib/social-intelligence/publishing-runtime';

export async function GET(req: Request) {
  if (!(await getRequestUser(req))) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ success: true, runtime: publishingRuntimeStatus(req.url) }, { headers: { 'Cache-Control': 'no-store' } });
}
