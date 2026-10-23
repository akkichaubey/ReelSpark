import { NextRequest, NextResponse } from 'next/server';
import { validateSocialPost } from '@/lib/social-intelligence/post-validator';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const report = validateSocialPost(body);
    return NextResponse.json({ success: true, report });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
