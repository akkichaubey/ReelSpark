import { NextRequest, NextResponse } from 'next/server';
import { loadProject } from '@/lib/storage';
import { searchTranscript } from '@/lib/transcript';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await loadProject(id);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const body = await req.json();
    const query = body.query as string;

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ success: true, matches: [] });
    }

    const matches = searchTranscript(project.transcript, query);

    return NextResponse.json({
      success: true,
      query,
      matchCount: matches.length,
      matches,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
