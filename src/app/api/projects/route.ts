import { NextRequest, NextResponse } from 'next/server';
import { listProjects, saveProject } from '@/lib/storage';
import { Project } from '@/lib/types';
import { getRequestUser, isSameOriginAuthRequest } from '@/lib/auth';
import { ownsProject } from '@/lib/project-access';

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    const projects = await listProjects();
    return NextResponse.json({ success: true, projects: projects.filter(project => ownsProject(user, project)) });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    if (!isSameOriginAuthRequest(req)) return NextResponse.json({ success: false, error: 'Invalid request origin' }, { status: 403 });
    const body = await req.json();
    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newProject: Project = {
      ownerUserId: user.id,
      id: projectId,
      title: body.title?.trim() || 'Untitled Project',
      sourceType: body.sourceType || 'upload',
      youtubeUrl: body.youtubeUrl?.trim(),
      status: 'QUEUED',
      progress: 0,
      statusMessage: 'Project created and ready for video analysis',
      settings: {
        durationLimit: body.durationLimit || '60',
        aspectRatio: body.aspectRatio || 'original',
        normalizeAudio: body.normalizeAudio ?? true,
        burnSubtitles: body.burnSubtitles ?? false,
        subtitleStyle: body.subtitleStyle || {
          fontSize: 32,
          fontColor: '#FFFFFF',
          outlineColor: '#000000',
          outlineWidth: 2,
          verticalPosition: 'bottom',
          alignment: 'center',
        },
      },
      timelineCoverage: {
        analyzedSeconds: 0,
        totalSeconds: 0,
        coveragePercent: 0,
        ranges: [],
      },
      transcript: [],
      candidates: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveProject(newProject);
    return NextResponse.json({ success: true, project: newProject }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
