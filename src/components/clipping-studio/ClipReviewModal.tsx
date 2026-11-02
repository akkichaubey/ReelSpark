'use client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useRef, useState } from 'react';
import {
  formatMsToTimestamp,
  parseTimestampToMs,
  getMediaAssetWebUrl,
  type Clip,
  type MediaAsset,
} from '@/lib/clipping-studio/contracts';

export function ClipReviewModal({
  clip,
  asset,
  onSave,
  onSaveToLibrary,
  onClose,
  mediaUrl,
  showNotes = true,
}: {
  clip: Clip;
  asset: MediaAsset;
  onSave: (updates: Partial<Clip>) => void;
  onSaveToLibrary?: (
    updates: Partial<Clip>
  ) => Promise<boolean | void> | boolean | void;
  onClose: () => void;
  mediaUrl?: string;
  showNotes?: boolean;
}) {
  const player = useRef<HTMLMediaElement>(null);
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const [name, setName] = useState(clip.name);
  const [notes, setNotes] = useState(clip.notes || '');
  const [startText, setStartText] = useState(formatMsToTimestamp(clip.startMs));
  const [endText, setEndText] = useState(formatMsToTimestamp(clip.endMs));
  const [position, setPosition] = useState(clip.startMs);
  const [error, setError] = useState('');
  let start = 0,
    end = 0;
  try {
    start = parseTimestampToMs(startText);
    end = parseTimestampToMs(endText);
  } catch {
    /* Inline validation on preview/save. */
  }
  const valid =
    name.trim().length > 0 &&
    start >= 0 &&
    end > start &&
    end <= asset.metadata.durationMs;
  const preview = () => {
    if (!valid) {
      setError(
        'Enter a title and valid start/end times inside the source duration.'
      );
      return;
    }
    const media = player.current;
    if (!media) return;
    media.currentTime = start / 1000;
    setPosition(start);
    void media
      .play()
      .catch(() =>
        setError('Playback could not start. Use the player controls to retry.')
      );
  };
  const properties = {
    ref: (element: HTMLMediaElement | null) => {
      player.current = element;
    },
    src: mediaUrl || getMediaAssetWebUrl(asset),
    controls: true,
    onLoadedMetadata: () => {
      if (player.current) player.current.currentTime = clip.startMs / 1000;
    },
    onTimeUpdate: () => {
      const media = player.current;
      if (!media) return;
      setPosition(Math.round(media.currentTime * 1000));
      if (
        valid &&
        (media.currentTime * 1000 >= end ||
          media.currentTime * 1000 < start - 100)
      ) {
        media.pause();
        media.currentTime = start / 1000;
      }
    },
    onError: () =>
      setError(
        'Source media unavailable. Restore or upload the source before editing.'
      ),
  };
  const input =
    'w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm';
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !savingToLibrary) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Edit clip"
        className="max-h-[95vh] w-full max-w-2xl space-y-4 overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 p-4 sm:p-6"
      >
        <h2 className="font-bold">Review & Edit Clip</h2>
        <fieldset disabled={savingToLibrary} className="contents">
          {asset.metadata.hasVideo ? (
            <video
              {...properties}
              playsInline
              className="max-h-[35vh] w-full bg-black"
            />
          ) : (
            <audio {...properties} className="w-full" />
          )}
          <label className="block text-xs">
            Clip title
            <Input
              autoFocus
              maxLength={300}
              className={input}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs">
              Start timestamp
              <Input
                className={input}
                value={startText}
                onChange={(e) => setStartText(e.target.value)}
              />
            </label>
            <label className="text-xs">
              End timestamp
              <Input
                className={input}
                value={endText}
                onChange={(e) => setEndText(e.target.value)}
              />
            </label>
          </div>
          <div className="space-y-2 rounded-lg bg-zinc-950 p-3 text-xs">
            <label className="block">
              Start boundary
              <input
                aria-label="Clip start boundary"
                type="range"
                min="0"
                max={asset.metadata.durationMs}
                step="1"
                value={start}
                onChange={(e) =>
                  setStartText(formatMsToTimestamp(Number(e.target.value)))
                }
                className="w-full accent-emerald-400"
              />
            </label>
            <label className="block">
              End boundary
              <input
                aria-label="Clip end boundary"
                type="range"
                min="0"
                max={asset.metadata.durationMs}
                step="1"
                value={end}
                onChange={(e) =>
                  setEndText(formatMsToTimestamp(Number(e.target.value)))
                }
                className="w-full accent-rose-400"
              />
            </label>
            <label className="block">
              Preview playhead
              <input
                aria-label="Clip preview playhead"
                type="range"
                min={start}
                max={Math.max(start, end)}
                step="1"
                value={Math.max(start, Math.min(end, position))}
                onChange={(e) => {
                  if (player.current)
                    player.current.currentTime = Number(e.target.value) / 1000;
                  setPosition(Number(e.target.value));
                }}
                className="w-full accent-amber-400"
              />
            </label>
            <p>
              {formatMsToTimestamp(position)} · Duration{' '}
              {formatMsToTimestamp(Math.max(0, end - start))}
            </p>
          </div>
          {showNotes && (
            <label className="block text-xs">
              Notes
              <Input
                className={input}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          )}
          {!valid && (
            <p className="text-xs text-amber-300">
              End must follow start and stay within{' '}
              {formatMsToTimestamp(asset.metadata.durationMs)}.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              onClick={onClose}
              className="rounded border border-zinc-600 px-4 py-2"
            >
              Cancel
            </Button>
            <Button
              disabled={!valid}
              onClick={preview}
              className="rounded border border-amber-400 px-4 py-2 disabled:opacity-40"
            >
              Preview Changes
            </Button>
            <Button
              disabled={!valid}
              onClick={() => {
                player.current?.pause();
                onSave({
                  name: name.trim(),
                  notes: notes.trim(),
                  startMs: start,
                  endMs: end,
                  durationMs: end - start,
                });
                onClose();
              }}
              className="rounded border border-zinc-500 bg-zinc-800 px-4 py-2 font-semibold text-white hover:bg-zinc-700 disabled:opacity-40"
            >
              Save Clip Changes
            </Button>
            {onSaveToLibrary && (
              <Button
                disabled={!valid || savingToLibrary}
                onClick={async () => {
                  player.current?.pause();
                  const updates = {
                    name: name.trim(),
                    notes: notes.trim(),
                    startMs: start,
                    endMs: end,
                    durationMs: end - start,
                  };
                  setSavingToLibrary(true);
                  setError('');
                  try {
                    const saved = await onSaveToLibrary(updates);
                    if (saved === false)
                      throw new Error(
                        'The reel was not saved. Your edits are still here; retry when ready.'
                      );
                    onSave(updates);
                    onClose();
                  } catch (error) {
                    setError(
                      error instanceof Error
                        ? error.message
                        : 'Could not save reel'
                    );
                  } finally {
                    setSavingToLibrary(false);
                  }
                }}
                className="rounded bg-amber-400 px-4 py-2 font-bold text-black hover:bg-amber-300 disabled:opacity-40"
              >
                {savingToLibrary ? 'Saving to Library…' : 'Save to Saved Reels'}
              </Button>
            )}
          </div>
        </fieldset>
      </section>
    </div>
  );
}
