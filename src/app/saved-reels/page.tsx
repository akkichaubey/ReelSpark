'use client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { SavedReelPlayer } from '@/components/saved-reels/SavedReelPlayer';
import { useAuthStore } from '@/lib/use-auth-store';
import { AuthModal } from '@/components/AuthModal';
import { saveReel } from '@/lib/saved-reels/client';
import { reelDuration, type SavedReel } from '@/lib/saved-reels/types';

function Library() {
  const { user, checkAuth, openAuthModal } = useAuthStore();
  const [reels, setReels] = useState<SavedReel[]>([]);
  const [loading, setLoading] = useState(true);
  const [durable, setDurable] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('updated');
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [preview, setPreview] = useState<SavedReel | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const loadSequence = useRef(0);
  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/saved-reels?${new URLSearchParams({ page: String(page), q: query, sort, filter })}`,
        { cache: 'no-store' }
      );
      const data = await response.json();
      if (sequence !== loadSequence.current) return;
      if (!response.ok) throw new Error(data.error || 'Could not load reels');
      setReels(data.reels);
      setDurable(data.durable);
      setHasMore(data.hasMore);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Load failed');
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [page, query, sort, filter]);
  useEffect(() => {
    if (!user?.id) return;
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [user?.id, load]);
  const action = async (
    reel: SavedReel,
    kind: 'rename' | 'duplicate' | 'delete'
  ) => {
    let title = reel.title;
    if (kind === 'rename') {
      const name = window.prompt('Reel title', title);
      if (!name?.trim()) return;
      title = name.trim();
    }
    if (
      kind === 'delete' &&
      !window.confirm(
        `Delete “${title}” from Saved Reels? This cannot be undone. Shared media and other reels will be retained.`
      )
    )
      return;
    setBusy(reel.id);
    setMessage('');
    try {
      if (kind === 'delete') {
        const response = await fetch(
          `/api/saved-reels?id=${encodeURIComponent(reel.id)}&revision=${reel.revision}`,
          { method: 'DELETE' }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Delete failed');
      } else
        await saveReel(
          {
            ...reel.project,
            title: kind === 'duplicate' ? `${title} (Copy)` : title,
          },
          {
            ...(kind === 'rename'
              ? { id: reel.id, revision: reel.revision }
              : {}),
            originProjectName: reel.originProjectName,
            originProjectId: reel.originProjectId,
          }
        );
      setMessage(
        kind === 'delete'
          ? 'Reel deleted; shared media retained.'
          : kind === 'duplicate'
            ? 'Copy saved; original unchanged.'
            : 'Title updated.'
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };
  const visible = reels;
  const button =
    'rounded-lg border border-zinc-700 px-3 py-2 text-xs hover:border-amber-400 disabled:opacity-40';
  return (
    <DashboardLayout
      title="Saved Reels"
      subtitle="Your independent, editable reels"
    >
      <div className="space-y-5 p-3 sm:p-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Saved Reels{' '}
            <span className="text-sm text-zinc-500">{reels.length}</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Review, play and reopen your independent reels.
          </p>
        </div>
        {!user ? (
          <Button onClick={() => openAuthModal('login')} className={button}>
            Sign in to open your Saved Reels
          </Button>
        ) : (
          <>
            <p className="text-sm text-zinc-400">
              {durable
                ? 'Cloud library · your media and edits are saved to your account.'
                : 'Saved on this server · persistent storage or cloud library storage is needed to keep reels across deployments.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label="Search saved reels"
                placeholder="Search title or original project…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                className="min-w-[180px] flex-1 rounded-lg border border-zinc-700 bg-zinc-900 p-2"
              />
              <div className="w-40">
                <Select
                  value={sort}
                  onValueChange={(val) => {
                    setSort(val);
                    setPage(0);
                  }}
                >
                  <SelectTrigger aria-label="Sort reels" className="h-10 bg-zinc-900 border-zinc-700 text-xs">
                    <SelectValue placeholder="Sort reels" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-950 border-zinc-800 text-white min-w-[10rem]">
                    <SelectItem value="updated">Last modified</SelectItem>
                    <SelectItem value="created">Newest created</SelectItem>
                    <SelectItem value="name">Title A–Z</SelectItem>
                    <SelectItem value="duration">Longest first</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-44">
                <Select
                  value={filter}
                  onValueChange={(val) => {
                    setFilter(val);
                    setPage(0);
                  }}
                >
                  <SelectTrigger aria-label="Filter reels" className="h-10 bg-zinc-900 border-zinc-700 text-xs">
                    <SelectValue placeholder="Filter reels" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-950 border-zinc-800 text-white min-w-[12rem]">
                    <SelectItem value="all">All reels</SelectItem>
                    <SelectItem value="rendered">Rendered</SelectItem>
                    <SelectItem value="editable">Editable / needs render</SelectItem>
                    <SelectItem value="captions">With captions</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className={button}
                aria-pressed={view === 'grid'}
                onClick={() => setView('grid')}
              >
                Grid
              </Button>
              <Button
                className={button}
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
              >
                List
              </Button>
              <Button className={button} onClick={() => void load()}>
                Refresh
              </Button>
            </div>
            {loading ? (
              <p role="status">Loading reels…</p>
            ) : !visible.length ? (
              <div className="rounded-xl border border-zinc-800 p-8 text-center">
                <p>No saved reels yet match this view.</p>
                <Link
                  className="text-amber-400"
                  href="/clipping-studio?tab=timeline"
                >
                  Review clips in Studio
                </Link>{' '}
                ·{' '}
                <Link className="text-amber-400" href="/reel-maker">
                  Open Reel Maker
                </Link>
              </div>
            ) : (
              <div
                className={
                  view === 'grid'
                    ? 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'
                    : 'space-y-3'
                }
              >
                {visible.map((reel) => (
                  <article
                    key={reel.id}
                    className={`rounded-xl border border-zinc-800 bg-zinc-900 p-4 ${view === 'list' ? 'sm:flex sm:items-center sm:gap-4' : ''}`}
                  >
                    <Button
                      aria-label={`Play ${reel.title}`}
                      onClick={() => setPreview(reel)}
                      className={`relative block overflow-hidden rounded-lg bg-black ${view === 'list' ? 'h-28 w-full shrink-0 sm:w-40' : 'h-40 w-full'}`}
                    >
                      {reel.project.thumbnailUrl ? (
                        <Image
                          width={320}
                          height={180}
                          unoptimized
                          alt="Reel cover"
                          src={reel.project.thumbnailUrl}
                          className="h-full w-full object-contain"
                        />
                      ) : reel.project.image?.mediaType === 'video' ? (
                        <video
                          src={`${reel.project.image.fileUrl}#t=0.1`}
                          preload="metadata"
                          muted
                          playsInline
                          className="h-full w-full object-contain"
                        />
                      ) : reel.project.image ? (
                        <Image
                          width={320}
                          height={180}
                          unoptimized
                          alt="Reel background"
                          src={reel.project.image.fileUrl}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="text-zinc-400">Audio reel</span>
                      )}
                      <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                        ▶ Play
                      </span>
                    </Button>
                    <div className="min-w-0 flex-1 space-y-2 pt-3">
                      <h2 className="truncate font-bold" title={reel.title}>
                        {reel.title}
                      </h2>
                      <p className="text-xs text-amber-300">
                        {reelDuration(reel.project).toFixed(2)}s ·{' '}
                        {reel.project.renderedVideoUrl
                          ? 'Rendered'
                          : 'Editable · needs render'}
                      </p>
                      <p className="text-xs text-zinc-400">
                        Transcript:{' '}
                        {reel.project.transcript.length
                          ? 'Available'
                          : 'Not added'}{' '}
                        · Captions:{' '}
                        {reel.project.captionGroups.length
                          ? 'Available'
                          : 'Not added'}
                      </p>
                      <p className="text-xs text-zinc-500">
                        Created {new Date(reel.createdAt).toLocaleString()}
                        <br />
                        Modified {new Date(reel.updatedAt).toLocaleString()}
                        <br />
                        Source: {reel.originProjectName || 'Reel Maker'}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          className={button}
                          href={`/reel-maker?savedReel=${encodeURIComponent(reel.id)}`}
                        >
                          Edit
                        </Link>
                        <Button
                          className={button}
                          disabled={busy === reel.id}
                          onClick={() => void action(reel, 'rename')}
                        >
                          Rename
                        </Button>
                        <Button
                          className={button}
                          disabled={busy === reel.id}
                          onClick={() => void action(reel, 'duplicate')}
                        >
                          Duplicate
                        </Button>
                        {reel.project.renderedVideoUrl ? (
                          <a
                            className={button}
                            href={reel.project.renderedVideoUrl}
                            download={`${reel.title}.mp4`}
                          >
                            Download
                          </a>
                        ) : (
                          <Link
                            className={button}
                            href={`/reel-maker?savedReel=${encodeURIComponent(reel.id)}`}
                          >
                            Render & Download
                          </Link>
                        )}
                        <Button
                          className={`${button} text-red-300`}
                          disabled={busy === reel.id}
                          onClick={() => void action(reel, 'delete')}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <nav
              aria-label="Saved reels pages"
              className="flex items-center justify-between gap-3 text-sm"
            >
              <Button
                className={button}
                disabled={loading || page === 0}
                onClick={() => setPage((previous) => Math.max(0, previous - 1))}
              >
                Previous page
              </Button>
              <span>Page {page + 1}</span>
              <Button
                className={button}
                disabled={loading || !hasMore}
                onClick={() => setPage((previous) => previous + 1)}
              >
                Next page
              </Button>
            </nav>
          </>
        )}
        {message && (
          <p role="status" className="text-sm text-amber-200">
            {message}
          </p>
        )}
      </div>
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setPreview(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Preview ${preview.title}`}
            className="max-h-[95vh] w-full max-w-3xl overflow-auto rounded-xl border border-zinc-700 bg-zinc-950 p-4"
          >
            <div className="mb-3 flex justify-between gap-3">
              <h2 className="truncate font-bold">{preview.title}</h2>
              <Button
                autoFocus
                onClick={() => setPreview(null)}
                className={button}
              >
                Close preview
              </Button>
            </div>
            <SavedReelPlayer key={preview.id} project={preview.project} />
          </section>
        </div>
      )}
      <AuthModal />
    </DashboardLayout>
  );
}
export default function SavedReelsPage() {
  const userId = useAuthStore((state) => state.user?.id);
  return (
    <Suspense fallback={<p>Loading library…</p>}>
      <Library key={userId || 'guest'} />
    </Suspense>
  );
}
