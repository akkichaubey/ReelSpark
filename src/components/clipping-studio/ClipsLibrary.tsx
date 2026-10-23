'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Scissors,
  Play,
  Pause,
  Volume2,
  Copy,
  Trash2,
  Edit2,
  Sparkles,
  Clock,
  Search,
  ExternalLink,
  Check,
  Film,
  LayoutGrid,
  List,
  ArrowUpDown,
  Layers,
  Loader2,
} from 'lucide-react';
import { useClippingStore } from '@/lib/clipping-studio/use-clipping-store';
import { formatMsToTimestamp, Clip } from '@/lib/clipping-studio/contracts';
import { createCaptionProjectFromClip } from '@/lib/caption-maker/clip-to-reel';
import { saveProjectToLocalStorage } from '@/lib/caption-maker/project-storage';

export const ClipsLibrary: React.FC = () => {
  const router = useRouter();
  const {
    activeProject,
    selectedAssetId,
    selectedClipId,
    selectClip,
    updateClip,
    deleteClip,
    duplicateClip,
    setCurrentTimeMs,
    setInPoint,
    setOutPoint,
    isPlaying,
    auditionClip,
    auditioningClipId,
  } = useClippingStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'timeline' | 'duration' | 'name'>('timeline');
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [bridgingClipId, setBridgingClipId] = useState<string | null>(null);

  const clips = activeProject?.clips || [];

  const filteredClips = useMemo(() => {
    let result = clips.filter((c) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return c.name.toLowerCase().includes(q) || (c.notes && c.notes.toLowerCase().includes(q));
    });

    if (sortBy === 'timeline') {
      result = [...result].sort((a, b) => a.startMs - b.startMs);
    } else if (sortBy === 'duration') {
      result = [...result].sort((a, b) => b.durationMs - a.durationMs);
    } else if (sortBy === 'name') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [clips, searchQuery, sortBy]);

  const totalClipsDurationMs = useMemo(() => {
    return clips.reduce((acc, c) => acc + c.durationMs, 0);
  }, [clips]);

  const handleAudition = (clip: Clip) => {
    if (!clip) return;
    const isThisPlaying = isPlaying && auditioningClipId === clip.id;
    const mediaEl = typeof document !== 'undefined'
      ? document.querySelector<HTMLMediaElement>('#clipping-studio-player-media')
      : null;

    if (isThisPlaying) {
      if (mediaEl && !mediaEl.paused) {
        mediaEl.pause();
      }
    } else if (mediaEl && activeProject) {
      const currentAssetId = selectedAssetId ?? activeProject.mediaAssets?.[0]?.id ?? null;
      if (currentAssetId && clip.mediaAssetId === currentAssetId) {
        mediaEl.currentTime = clip.startMs / 1000;
        const playPromise = mediaEl.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => console.warn('[Direct Click Play]', err));
        }
      }
    }

    auditionClip(clip);
  };

  const handleSaveEdit = (clipId: string) => {
    if (editName.trim()) {
      updateClip(clipId, {
        name: editName.trim(),
        notes: editNotes.trim(),
      });
    }
    setEditingClipId(null);
  };

  // Seamless bridge to AI Reel Maker (/reel-maker)
  const handleSendToCaptionMaker = async (clip: Clip) => {
    if (!activeProject || bridgingClipId) return;
    const mediaAsset = activeProject.mediaAssets.find((a) => a.id === clip.mediaAssetId);

    setBridgingClipId(clip.id);
    try {
      const res = await fetch('/api/clipping-studio/bridge-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: clip.id,
          clipName: clip.name,
          startMs: clip.startMs,
          endMs: clip.endMs,
          durationMs: clip.durationMs,
          sourcePath: mediaAsset?.localPath,
          sourceFilename: mediaAsset?.filename,
          hasVideo: Boolean(mediaAsset?.metadata?.hasVideo),
          projectId: activeProject.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.audio) {
        throw new Error(data.error || 'Failed to prepare clip audio for Reel Maker');
      }

      // Create a ClipCandidate adapter to pass through the project creator
      const candidateAdapter: any = {
        id: clip.id,
        title: data.titleHindi || data.titleEnglish || clip.name,
        titleHindi: data.titleHindi,
        titleEnglish: data.titleEnglish,
        start: clip.startMs / 1000,
        end: clip.endMs / 1000,
        duration: data.audio.duration || clip.durationMs / 1000,
        transcriptWords: [],
        score: 95,
        hookStrength: 90,
        emotionalImpact: 90,
        topic: 'Motivational',
      };

      const projectAdapter: any = {
        id: activeProject.id,
        title: activeProject.name,
        localVideoPath: mediaAsset?.localPath,
        originalFileName: mediaAsset?.filename || 'clip_source.mp4',
        videoMetadata: {
          duration: (mediaAsset?.metadata?.durationMs || 60000) / 1000,
          fps: mediaAsset?.metadata?.fps || 30,
          width: mediaAsset?.metadata?.width || 1080,
          height: mediaAsset?.metadata?.height || 1920,
          hasAudio: mediaAsset?.metadata?.hasAudio ?? true,
          videoCodec: mediaAsset?.metadata?.videoCodec || 'h264',
          audioCodec: mediaAsset?.metadata?.audioCodec || 'aac',
        },
      };

      const audioOverride: any = {
        audioUrl: data.audio.fileUrl,
        storagePath: data.audio.storagePath,
        duration: data.audio.duration,
        fileSize: data.audio.fileSize,
        fileName: data.audio.fileName,
        syncedSegments: data.syncedSegments || undefined,
        titleHindi: data.titleHindi || undefined,
        titleEnglish: data.titleEnglish || undefined,
        isAudioSynced: Boolean(data.isAudioSynced),
      };

      const captionProject = createCaptionProjectFromClip(
        candidateAdapter,
        projectAdapter,
        'hi',
        audioOverride
      );

      // If video asset was extracted from source video, attach it as the project image/video
      if (data.video) {
        captionProject.image = data.video;
      }

      saveProjectToLocalStorage(captionProject);
      router.push('/reel-maker');
    } catch (err: any) {
      console.error('Failed to bridge clip to Reel Maker:', err);
      alert(err.message || 'Failed to prepare clip for Reel Maker');
    } finally {
      setBridgingClipId(null);
    }
  };

  const getDurationBadgeColor = (durationMs: number) => {
    if (durationMs <= 30000) {
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    } else if (durationMs <= 60000) {
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    }
    return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
  };

  return (
    <div className="space-y-4">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-300 flex items-center space-x-2">
              <Scissors className="w-4 h-4 text-amber-400" />
              <span>Project Clips Library ({clips.length})</span>
            </h3>
            {clips.length > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-white/10">
                Total: {formatMsToTimestamp(totalClipsDurationMs, false)}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Click any clip to audition its bounds on the timeline and player.
          </p>
        </div>

        {/* Controls: Search, Sort & View Mode */}
        {clips.length > 0 && (
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            {/* Search */}
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search clips..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-900 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs bg-zinc-900 border border-white/10 rounded-lg text-zinc-300 focus:outline-none focus:border-amber-400"
            >
              <option value="timeline">Sort: Timeline Order</option>
              <option value="duration">Sort: Duration (Longest)</option>
              <option value="name">Sort: Name (A-Z)</option>
            </select>

            {/* Grid vs List View Toggle */}
            <div className="flex items-center bg-zinc-900 border border-white/10 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
                  viewMode === 'grid' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="Grid Cards View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
                  viewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="Compact List View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Empty State */}
      {clips.length === 0 ? (
        <div className="text-center py-12 px-4 rounded-xl bg-zinc-900/20 border border-white/5 space-y-2">
          <Scissors className="w-8 h-8 text-zinc-600 mx-auto" />
          <p className="text-xs text-zinc-400 font-medium">No clips created yet.</p>
          <p className="text-[11px] text-zinc-500">
            Mark In/Out points on the timeline above or use the Bulk Timestamp Editor to create clips.
          </p>
        </div>
      ) : filteredClips.length === 0 ? (
        <div className="text-center py-8 text-xs text-zinc-400">
          No clips match your search "{searchQuery}".
        </div>
      ) : viewMode === 'list' ? (
        /* Compact DAW List View */
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-zinc-900/30">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 border-b border-white/10 text-zinc-400 text-[11px] uppercase">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3">Clip Name</th>
                <th className="py-2.5 px-3">Source Asset</th>
                <th className="py-2.5 px-3 font-mono">Start</th>
                <th className="py-2.5 px-3 font-mono">End</th>
                <th className="py-2.5 px-3 font-mono">Duration</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredClips.map((clip, idx) => {
                const isSelected = selectedClipId === clip.id;
                const isThisClipPlaying = isPlaying && auditioningClipId === clip.id;
                const mediaAsset = activeProject?.mediaAssets.find((a) => a.id === clip.mediaAssetId);

                return (
                  <tr
                    key={clip.id}
                    onClick={() => handleAudition(clip)}
                    className={`transition-colors cursor-pointer ${
                      isThisClipPlaying
                        ? 'bg-amber-500/20 hover:bg-amber-500/25 border-l-4 border-l-amber-400'
                        : isSelected
                        ? 'bg-amber-500/10 hover:bg-amber-500/15 border-l-2 border-l-amber-400'
                        : 'hover:bg-zinc-800/50'
                    }`}
                  >
                    <td className="py-2 px-3 text-center text-zinc-500 font-mono text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white hover:text-amber-400 transition-colors">
                          {clip.name}
                        </span>
                        {isThisClipPlaying && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-400 text-zinc-950 font-black animate-pulse flex items-center space-x-0.5">
                            <Volume2 className="w-2.5 h-2.5" />
                            <span>PLAYING</span>
                          </span>
                        )}
                        {clip.notes && (
                          <span className="text-[10px] text-zinc-400 italic max-w-xs truncate">
                            ({clip.notes})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-zinc-400 truncate max-w-[140px]">
                      {mediaAsset?.filename || 'Unknown'}
                    </td>
                    <td className="py-2 px-3 font-mono text-emerald-400">
                      {formatMsToTimestamp(clip.startMs)}
                    </td>
                    <td className="py-2 px-3 font-mono text-rose-400">
                      {formatMsToTimestamp(clip.endMs)}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold">
                      <span className={`px-2 py-0.5 rounded text-[10px] border ${getDurationBadgeColor(clip.durationMs)}`}>
                        {formatMsToTimestamp(clip.durationMs, false)}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end space-x-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleAudition(clip)}
                          className={`p-1.5 rounded transition-all cursor-pointer ${
                            isThisClipPlaying
                              ? 'bg-amber-400 text-zinc-950 font-bold shadow-sm shadow-amber-400/30 ring-1 ring-amber-400'
                              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                          }`}
                          title={isThisClipPlaying ? 'Pause Clip' : 'Audition in Player'}
                        >
                          {isThisClipPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicateClip(clip.id)}
                          className="p-1 rounded text-zinc-400 hover:text-white"
                          title="Duplicate Clip"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={bridgingClipId === clip.id}
                          onClick={() => handleSendToCaptionMaker(clip)}
                          className="p-1 rounded text-amber-400 hover:bg-amber-500/10 disabled:opacity-50 cursor-pointer"
                          title="Open in AI Reel Maker"
                        >
                          {bridgingClipId === clip.id ? (
                            <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteClip(clip.id)}
                          className="p-1 rounded text-zinc-500 hover:text-rose-400"
                          title="Delete Clip"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Rich Grid Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredClips.map((clip) => {
            const isSelected = selectedClipId === clip.id;
            const isThisClipPlaying = isPlaying && auditioningClipId === clip.id;
            const isEditing = editingClipId === clip.id;
            const mediaAsset = activeProject?.mediaAssets.find((a) => a.id === clip.mediaAssetId);

            return (
              <div
                key={clip.id}
                onClick={() => handleAudition(clip)}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 cursor-pointer group ${
                  isThisClipPlaying
                    ? 'bg-zinc-900 border-amber-400 shadow-xl shadow-amber-500/15 ring-2 ring-amber-400/40'
                    : isSelected
                    ? 'bg-zinc-900 border-amber-500/60 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/30 hover:border-amber-400'
                    : 'bg-zinc-900/50 hover:bg-zinc-900 hover:border-amber-400/50 border-white/10'
                }`}
              >
                {/* Title & Renaming */}
                <div className="space-y-1">
                  {isEditing ? (
                    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-2 py-1 text-xs bg-zinc-950 border border-amber-400 rounded text-white"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Add notes..."
                        className="w-full px-2 py-1 text-xs bg-zinc-950 border border-white/10 rounded text-zinc-300"
                      />
                      <div className="flex items-center space-x-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(clip.id)}
                          className="px-2.5 py-0.5 text-[11px] bg-white text-zinc-950 font-bold rounded cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingClipId(null)}
                          className="px-2 py-0.5 text-[11px] bg-zinc-800 text-zinc-400 rounded cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 truncate mr-2">
                          <h4
                            onClick={() => handleAudition(clip)}
                            className="text-sm font-bold text-white hover:text-amber-400 cursor-pointer truncate max-w-[170px]"
                            title={clip.name}
                          >
                            {clip.name}
                          </h4>
                          {isThisClipPlaying && (
                            <span className="shrink-0 inline-flex items-center space-x-1 px-1.5 py-0.2 rounded-full text-[9px] font-black bg-amber-400 text-zinc-950 uppercase tracking-wider animate-pulse">
                              <Volume2 className="w-2.5 h-2.5" />
                              <span>PLAYING</span>
                            </span>
                          )}
                        </div>

                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border shrink-0 ${getDurationBadgeColor(
                            clip.durationMs
                          )}`}
                        >
                          {formatMsToTimestamp(clip.durationMs, false)}
                        </span>
                      </div>

                      <p className="text-[11px] text-zinc-500 truncate" title={mediaAsset?.filename}>
                        Source: {mediaAsset?.filename || 'Unknown Media'}
                      </p>
                      {clip.notes && (
                        <p className="text-xs text-zinc-400 mt-1 italic line-clamp-1">{clip.notes}</p>
                      )}
                    </div>
                  )}

                  {/* Timecodes */}
                  <div className="flex items-center space-x-2 text-[11px] font-mono text-zinc-400 pt-1">
                    <span className="text-emerald-400 font-semibold">{formatMsToTimestamp(clip.startMs)}</span>
                    <span className="text-zinc-600">→</span>
                    <span className="text-rose-400 font-semibold">{formatMsToTimestamp(clip.endMs)}</span>
                  </div>
                </div>

                {/* Actions Bar */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center space-x-1">
                    {/* Audition */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAudition(clip);
                      }}
                      title={isThisClipPlaying ? 'Pause Clip' : 'Audition Clip in Player'}
                      className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                        isThisClipPlaying
                          ? 'bg-amber-400 text-zinc-950 font-bold shadow-md shadow-amber-400/30 scale-105 ring-2 ring-amber-400/30'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                      }`}
                    >
                      {isThisClipPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                    </button>

                    {/* Edit */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingClipId(clip.id);
                        setEditName(clip.name);
                        setEditNotes(clip.notes || '');
                      }}
                      title="Edit Clip Name & Notes"
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Duplicate */}
                    <button
                      type="button"
                      onClick={() => duplicateClip(clip.id)}
                      title="Duplicate Clip"
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => deleteClip(clip.id)}
                      title="Delete Clip"
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Send to AI Reel Maker */}
                  <button
                    type="button"
                    disabled={bridgingClipId === clip.id}
                    onClick={() => handleSendToCaptionMaker(clip)}
                    title="Open this clip in AI Reel Maker"
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold border border-amber-500/30 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {bridgingClipId === clip.id ? (
                      <>
                        <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                        <span className="hidden sm:inline">Preparing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span className="hidden sm:inline">Caption Reel</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
