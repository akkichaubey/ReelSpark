import { runtimeOrigin } from '@/lib/runtime-origin';
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, isSameOriginAuthRequest } from '@/lib/auth';
import { dispatchPublishingJob } from '@/lib/social-intelligence/publisher-dispatcher';
import { PublishRequestPayload } from '@/lib/social-intelligence/publishing-types';

export async function POST(req: NextRequest) {
  try {
    if (!isSameOriginAuthRequest(req)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body: PublishRequestPayload = await req.json();

    if (!body.videoPath || typeof body.videoPath !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Valid video file path is required for publishing' },
        { status: 400 }
      );
    }

    if (!body.selectedPlatforms || body.selectedPlatforms.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Please select at least one social media platform to publish' },
        { status: 400 }
      );
    }

    if (!body.defaultCaption || body.defaultCaption.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Post caption/copy cannot be empty' },
        { status: 400 }
      );
    }

    const origin = runtimeOrigin(req.url);
    const job = await dispatchPublishingJob(user.id, origin, body);

    return NextResponse.json({
      success: true,
      jobId: job.id,
      job,
      message: 'Publishing initiated successfully',
    });
  } catch (err: any) {
    console.error('[API Publish Error]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
