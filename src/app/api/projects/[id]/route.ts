import { requireProjectAccess } from '@/lib/project-access';
import { NextRequest, NextResponse } from 'next/server';
import {
  deleteProject,
  loadProject,
  saveProject,
  ProjectMediaReferencedError,
  StorageInUseError,
} from '@/lib/storage';
import { withProjectMutation } from '@/lib/project-mutations';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const accessError = await requireProjectAccess(req, id);
    if (accessError) return accessError;
    const project = await loadProject(id);
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, project });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const accessError = await requireProjectAccess(req, id);
    if (accessError) return accessError;
    return await withProjectMutation(id, async () => {
      const project = await loadProject(id);
      if (!project) {
        return NextResponse.json(
          { success: false, error: 'Project not found' },
          { status: 404 }
        );
      }

      const updates = await req.json();

      if (updates.title) project.title = updates.title;
      if (updates.settings)
        project.settings = { ...project.settings, ...updates.settings };
      if (updates.candidates) project.candidates = updates.candidates;
      if (updates.candidateUpdate) {
        const { id: candidateId, changes } = updates.candidateUpdate;
        if (
          typeof candidateId !== 'string' ||
          !changes ||
          typeof changes !== 'object' ||
          Array.isArray(changes)
        )
          return NextResponse.json(
            { success: false, error: 'Invalid candidate update' },
            { status: 400 }
          );
        if (
          !project.candidates.some((candidate) => candidate.id === candidateId)
        )
          return NextResponse.json(
            { success: false, error: 'Clip not found' },
            { status: 404 }
          );
        project.candidates = project.candidates.map((candidate) =>
          candidate.id === candidateId
            ? { ...candidate, ...changes, id: candidateId }
            : candidate
        );
      }
      if (typeof updates.selectAllCandidates === 'boolean')
        project.candidates = project.candidates.map((candidate) => ({
          ...candidate,
          selected: updates.selectAllCandidates,
        }));
      if (typeof updates.deleteCandidateId === 'string')
        project.candidates = project.candidates.filter(
          (candidate) => candidate.id !== updates.deleteCandidateId
        );

      await saveProject(project);
      return NextResponse.json({ success: true, project });
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const accessError = await requireProjectAccess(req, id);
    if (accessError) return accessError;
    return await withProjectMutation(id, async () => {
      const success = await deleteProject(id);
      if (!success) {
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to delete project or project not found',
          },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true });
    });
  } catch (err: any) {
    if (err instanceof ProjectMediaReferencedError)
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 409 }
      );
    if (err instanceof StorageInUseError)
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 409 }
      );
    console.error('Project deletion failed:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
