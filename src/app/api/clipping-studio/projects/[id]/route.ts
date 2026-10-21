import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from '@/lib/config';
import { assertSafePath } from '@/lib/storage';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ success: false, error: 'Invalid project ID' }, { status: 400 });
    }

    const projectsBaseDir = path.join(APP_CONFIG.storageRoot, 'clipping-studio', 'projects');
    const projectDir = path.join(projectsBaseDir, projectId);

    // Assert safe path to prevent directory traversal
    assertSafePath(projectDir, projectsBaseDir);

    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }

    return NextResponse.json({
      success: true,
      message: `Project ${projectId} deleted successfully from storage`,
    });
  } catch (err: any) {
    console.error('[Clipping Studio API] Error deleting project storage:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to delete project storage' },
      { status: 500 }
    );
  }
}
