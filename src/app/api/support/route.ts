import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { APP_CONFIG } from '@/lib/config';
import { requireMediaUser } from '@/lib/media-api-access';

const SupportRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().email('Enter a valid email address').max(254),
  message: z.string().trim().min(1, 'Message is required').max(5_000),
});

/**
 * Local-first support inbox. This intentionally keeps requests on the same
 * machine as ReelSpark; deploying it publicly requires a proper support
 * provider and abuse protection.
 */
export async function POST(req: NextRequest) {
  try {
    const access = await requireMediaUser(req);
    if (access.error) return access.error;
    const parsed = SupportRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid support request' },
        { status: 400 }
      );
    }

    const inboxPath = path.join(APP_CONFIG.storageRoot, 'support_requests.json');
    await fs.promises.mkdir(path.dirname(inboxPath), { recursive: true });

    let requests: unknown[] = [];
    try {
      requests = JSON.parse(await fs.promises.readFile(inboxPath, 'utf8'));
      if (!Array.isArray(requests)) requests = [];
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
    }

    requests.push({
      id: `support_${randomUUID()}`,
      userId: access.user.id,
      ...parsed.data,
      createdAt: new Date().toISOString(),
    });
    await fs.promises.writeFile(inboxPath, JSON.stringify(requests, null, 2), 'utf8');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Support API]', error);
    return NextResponse.json({ success: false, error: 'Unable to save your request. Please try again.' }, { status: 500 });
  }
}
