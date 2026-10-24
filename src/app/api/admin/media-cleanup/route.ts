import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin-access';
import { cleanupUnusedMedia } from '@/lib/cloudflare/media-lifecycle';

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    const parsed = z.object({ dryRun: z.boolean().default(true), limit: z.number().int().min(1).max(10).default(10) }).strict().safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid cleanup options' }, { status: 400 });
    return NextResponse.json({ success: true, ...await cleanupUnusedMedia(parsed.data.dryRun, parsed.data.limit) });
  } catch { return NextResponse.json({ success: false, error: 'Cleanup unavailable; pending inventory records are retained for retry' }, { status: 503 }); }
}
