import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin-access';
import { getStorageUsage, runStorageMaintenance } from '@/lib/storage-maintenance';

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ success: true, usage: await getStorageUsage() }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ success: false, error: 'Storage usage is unavailable' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    const parsed = z.object({ dryRun: z.boolean().default(true), limit: z.number().int().min(1).max(10).default(10) }).strict().safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid cleanup options' }, { status: 400 });
    if (parsed.data.limit !== 10) {
      return NextResponse.json({ error: 'The cleanup batch size is fixed at 10 for safety' }, { status: 400 });
    }
    return NextResponse.json({ success: true, ...await runStorageMaintenance(parsed.data.dryRun) });
  } catch { return NextResponse.json({ success: false, error: 'Cleanup unavailable; pending inventory records are retained for retry' }, { status: 503 }); }
}
