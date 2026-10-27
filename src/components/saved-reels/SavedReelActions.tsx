'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { saveReel } from '@/lib/saved-reels/client';
import type { SavedReel } from '@/lib/saved-reels/types';
import type { CaptionProject } from '@/lib/caption-maker/types';
import { ClipReviewModal } from '@/components/clipping-studio/ClipReviewModal';

export function SavedReelActions({
  project,
  session,
  onSaved,
  onUpdateProject,
}: {
  project: CaptionProject;
  session: SavedReel | null;
  onSaved: (reel: SavedReel) => void;
  onUpdateProject: (updates: Partial<CaptionProject>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const router = useRouter();
  const dirty = Boolean(
    session && JSON.stringify(project) !== JSON.stringify(session.project)
  );
  const save = async (asNew: boolean) => {
    setBusy(true);
    setMessage('Saving media and editable state…');
    try {
      const reel = await saveReel(
        asNew && session
          ? { ...project, title: `${project.title.slice(0, 293)} (Copy)` }
          : project,
        {
          ...(!asNew && session
            ? { id: session.id, revision: session.revision }
            : {}),
          originProjectName: session?.originProjectName,
          originProjectId: session?.originProjectId,
        }
      );
      if (!asNew || !session) onSaved(reel);
      setMessage(
        asNew && session
          ? 'New reel saved; original preserved.'
          : 'Saved to library.'
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2 text-xs">
      <Link href="/saved-reels" className="text-amber-400">
        Saved Reels
      </Link>
      <button
        disabled={busy}
        onClick={() => void save(false)}
        className="rounded bg-amber-400 px-3 py-1.5 font-bold text-black disabled:opacity-50"
      >
        {session ? 'Save Changes' : 'Save Reel'}
      </button>
      {session && (
        <>
          <button
            disabled={busy}
            onClick={() => setReviewing(true)}
            className="rounded border border-zinc-700 px-3 py-1.5"
          >
            Edit Title / Timing
          </button>
          <button
            disabled={busy}
            onClick={() => void save(true)}
            className="rounded border border-zinc-700 px-3 py-1.5"
          >
            Save as New Reel
          </button>
          <button
            disabled={busy}
            onClick={() => {
              if (
                !dirty ||
                window.confirm(
                  'Discard unsaved reel edits and return to the library?'
                )
              )
                router.push('/saved-reels');
            }}
            className="px-2 py-1.5"
          >
            Cancel
          </button>
        </>
      )}
      <span role="status" className="text-zinc-400">
        {(!busy && dirty
          ? `${message ? `${message} · ` : ''}Unsaved changes · choose Save Changes to update this reel.`
          : message) ||
          (session
            ? 'Editing saved reel · changes are saved only when you choose Save Changes.'
            : '')}
      </span>
      {reviewing && session && (project.audio || project.image) && (
        <ClipReviewModal
          clip={{
            id: session.id,
            projectId: project.id,
            mediaAssetId: 'retained_source',
            name: project.title,
            startMs: Math.round((project.trimRange?.start || 0) * 1000),
            endMs: Math.round(
              (project.trimRange?.end ||
                project.audio?.duration ||
                project.image?.duration ||
                0) * 1000
            ),
            durationMs: 0,
            orderIndex: 0,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
          }}
          asset={{
            id: 'retained_source',
            projectId: project.id,
            filename:
              project.audio?.fileName ||
              project.image?.fileName ||
              project.title,
            localPath: '',
            fileSizeBytes:
              project.audio?.fileSize || project.image?.fileSize || 0,
            createdAt: project.createdAt,
            metadata: {
              durationMs: Math.round(
                (project.audio?.duration || project.image?.duration || 0) * 1000
              ),
              durationSeconds:
                project.audio?.duration || project.image?.duration || 0,
              sizeBytes: project.audio?.fileSize || 0,
              formatName:
                project.audio?.format || project.image?.format || 'MP4',
              aspectRatio: project.outputSettings.aspectRatio,
              hasVideo: project.image?.mediaType === 'video',
              hasAudio: Boolean(project.audio),
              width: project.image?.width,
              height: project.image?.height,
            },
          }}
          mediaUrl={
            project.image?.mediaType === 'video'
              ? project.image.fileUrl
              : project.audio?.fileUrl
          }
          showNotes={false}
          onSave={(updates) =>
            onUpdateProject({
              title: updates.name || project.title,
              trimRange: {
                start: (updates.startMs || 0) / 1000,
                end: (updates.endMs || 0) / 1000,
              },
            })
          }
          onClose={() => setReviewing(false)}
        />
      )}
    </div>
  );
}
