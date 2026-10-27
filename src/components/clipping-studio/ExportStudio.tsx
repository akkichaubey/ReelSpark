'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Download,
  Play,
  Scissors,
  Layers,
  Film,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCw,
  XCircle,
  Copy,
  Folder,
  Sliders,
  Info,
  Check,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  Trash2,
  Smartphone,
  Video,
  Mic,
  Zap,
} from 'lucide-react';
import { ProgressCircle } from '@/components/ProgressCircle';
import { getExportDownloadUrl } from '@/lib/clipping-studio/export-download';
import { useClippingStore } from '@/lib/clipping-studio/use-clipping-store';
import {
  ExportJob,
  formatMsToTimestamp,
  formatFilenameTemplate,
  CreateExportJobRequest,
} from '@/lib/clipping-studio/contracts';

export const ExportStudio: React.FC = () => {
  const {
    activeProject,
    selectedExportJobId,
    selectExportJob,
    submitClipExport,
    submitBatchClipsExport,
    submitRecipeExport,
    cancelExportJob,
    retryExportJob,
    deleteExportJob,
    syncExportJobs,
    mediaServiceStatus,
  } = useClippingStore();

  // Export target selector
  const [exportScope, setExportScope] = useState<'single_clip' | 'selected_clips' | 'all_clips' | 'recipe'>('single_clip');
  const [selectedClipId, setSelectedClipId] = useState<string>('');
  const [selectedBatchClipIds, setSelectedBatchClipIds] = useState<string[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');

  // Configuration options
  const [outputFormat, setOutputFormat] = useState<'mp4' | 'mov' | 'webm' | 'mp3' | 'wav'>('mp4');
  const [outputType, setOutputType] = useState<'video_and_audio' | 'video_only' | 'audio_only'>('video_and_audio');
  const [qualityProfile, setQualityProfile] = useState<'source' | 'high' | 'medium' | 'fast'>('high');
  const [targetResolution, setTargetResolution] = useState<'source' | '1080p' | '720p' | '4k'>('source');
  const [normalizeAudio, setNormalizeAudio] = useState<boolean>(false);
  const [filenameTemplate, setFilenameTemplate] = useState<string>('{project}_{name}_{index}');
  const [customOutputDir, setCustomOutputDir] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<'all' | 'running' | 'completed' | 'failed'>('all');

  const clips = activeProject?.clips || [];
  const recipes = activeProject?.mergeRecipes || [];
  const exportJobs = activeProject?.exportJobs || [];

  // Default clip selection
  useEffect(() => {
    if (!selectedClipId && clips.length > 0) {
      setSelectedClipId(clips[0].id);
    }
    if (!selectedRecipeId && recipes.length > 0) {
      setSelectedRecipeId(recipes[0].id);
    }
  }, [clips, recipes, selectedClipId, selectedRecipeId]);

  // Periodic poll active jobs
  useEffect(() => {
    const hasActiveJobs = exportJobs.some((j) => j.status === 'running' || j.status === 'queued');
    if (!hasActiveJobs) return;

    const interval = setInterval(() => {
      syncExportJobs();
    }, 1500);

    return () => clearInterval(interval);
  }, [exportJobs, syncExportJobs]);

  // Toggle batch clip selection
  const toggleBatchClip = (id: string) => {
    if (selectedBatchClipIds.includes(id)) {
      setSelectedBatchClipIds(selectedBatchClipIds.filter((cid) => cid !== id));
    } else {
      setSelectedBatchClipIds([...selectedBatchClipIds, id]);
    }
  };

  const selectAllClips = () => {
    setSelectedBatchClipIds(clips.map((c) => c.id));
  };

  const deselectAllClips = () => {
    setSelectedBatchClipIds([]);
  };

  // Preset Applicators
  const applyPreset = (preset: 'reel' | 'youtube' | 'podcast' | 'lossless') => {
    if (preset === 'reel') {
      setOutputFormat('mp4');
      setOutputType('video_and_audio');
      setQualityProfile('high');
      setTargetResolution('1080p');
      setNormalizeAudio(true);
    } else if (preset === 'youtube') {
      setOutputFormat('mp4');
      setOutputType('video_and_audio');
      setQualityProfile('high');
      setTargetResolution('1080p');
      setNormalizeAudio(false);
    } else if (preset === 'podcast') {
      setOutputFormat('mp3');
      setOutputType('audio_only');
      setQualityProfile('high');
      setNormalizeAudio(true);
    } else if (preset === 'lossless') {
      setOutputFormat('mp4');
      setOutputType('video_and_audio');
      setQualityProfile('source');
      setTargetResolution('source');
      setNormalizeAudio(false);
    }
  };

  // Live preview filename
  const previewFilename = useMemo(() => {
    const sampleName = exportScope === 'recipe'
      ? (recipes.find((r) => r.id === selectedRecipeId)?.name || 'Recipe')
      : (clips.find((c) => c.id === selectedClipId)?.name || 'Clip');

    return `${formatFilenameTemplate(filenameTemplate, {
      project: activeProject?.name || 'Project',
      name: sampleName,
      index: 1,
      time: '00_00_10',
      res: targetResolution !== 'source' ? targetResolution : undefined,
    })}.${outputFormat}`;
  }, [filenameTemplate, exportScope, selectedRecipeId, selectedClipId, recipes, clips, activeProject, targetResolution, outputFormat]);

  // Trigger export job
  const handleStartExport = async () => {
    setIsSubmitting(true);
    try {
      const options: Partial<CreateExportJobRequest> = {
        outputFormat,
        outputType,
        qualityProfile,
        targetResolution,
        normalizeAudio,
        filenameTemplate,
        outputDir: customOutputDir.trim() ? customOutputDir.trim() : undefined,
      };

      if (exportScope === 'single_clip') {
        if (!selectedClipId) return;
        await submitClipExport(selectedClipId, options);
      } else if (exportScope === 'selected_clips') {
        if (selectedBatchClipIds.length === 0) return;
        await submitBatchClipsExport(selectedBatchClipIds, options);
      } else if (exportScope === 'all_clips') {
        await submitBatchClipsExport(clips.map((c) => c.id), options);
      } else if (exportScope === 'recipe') {
        if (!selectedRecipeId) return;
        await submitRecipeExport(selectedRecipeId, options);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPath(text);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const filteredJobs = useMemo(() => {
    if (queueFilter === 'running') return exportJobs.filter((j) => j.status === 'running' || j.status === 'queued');
    if (queueFilter === 'completed') return exportJobs.filter((j) => j.status === 'completed');
    if (queueFilter === 'failed') return exportJobs.filter((j) => j.status === 'failed' || j.status === 'cancelled');
    return exportJobs;
  }, [exportJobs, queueFilter]);

  const selectedJob = exportJobs.find((j) => j.id === selectedExportJobId);

  return (
    <div className="space-y-8">
      {/* Configuration & Action Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 7 Columns: Export Job Setup */}
        <div className="lg:col-span-7 space-y-6">
          <div className="p-6 rounded-2xl bg-zinc-900 border border-white/10 space-y-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Export Media Queue</h3>
                  <p className="text-xs text-zinc-400">
                    Export single clips, multi-selected batches, or merged recipe sequences via local FFmpeg.
                  </p>
                </div>
              </div>

              {mediaServiceStatus?.ffmpeg.available ? (
                <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>FFmpeg 9.x Ready</span>
                </span>
              ) : (
                <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Media Daemon Standby</span>
                </span>
              )}
            </div>

            {/* Quick Platform Presets */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center space-x-1">
                <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                <span>Quick Platform Presets</span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => applyPreset('reel')}
                  className="p-2.5 rounded-xl bg-zinc-950/60 hover:bg-zinc-800 border border-white/10 text-left transition-colors cursor-pointer group"
                >
                  <div className="flex items-center space-x-1.5 text-amber-400 font-bold text-xs">
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Reels / Shorts</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-0.5 group-hover:text-zinc-400">
                    1080p MP4 + Audio Norm
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('youtube')}
                  className="p-2.5 rounded-xl bg-zinc-950/60 hover:bg-zinc-800 border border-white/10 text-left transition-colors cursor-pointer group"
                >
                  <div className="flex items-center space-x-1.5 text-rose-400 font-bold text-xs">
                    <Video className="w-3.5 h-3.5" />
                    <span>YouTube 16:9</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-0.5 group-hover:text-zinc-400">
                    1080p Master High CRF
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('podcast')}
                  className="p-2.5 rounded-xl bg-zinc-950/60 hover:bg-zinc-800 border border-white/10 text-left transition-colors cursor-pointer group"
                >
                  <div className="flex items-center space-x-1.5 text-cyan-400 font-bold text-xs">
                    <Mic className="w-3.5 h-3.5" />
                    <span>Podcast MP3</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-0.5 group-hover:text-zinc-400">
                    320kbps Audio Only
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('lossless')}
                  className="p-2.5 rounded-xl bg-zinc-950/60 hover:bg-zinc-800 border border-white/10 text-left transition-colors cursor-pointer group"
                >
                  <div className="flex items-center space-x-1.5 text-emerald-400 font-bold text-xs">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Instant Copy</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-0.5 group-hover:text-zinc-400">
                    0-Transcode Lossless
                  </p>
                </button>
              </div>
            </div>

            {/* Step 1: Target Scope */}
            <div className="space-y-3 pt-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                1. Select Export Target
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setExportScope('single_clip')}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between space-y-2 transition-all cursor-pointer ${
                    exportScope === 'single_clip'
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 ring-1 ring-amber-500/30'
                      : 'bg-zinc-800/50 border-white/5 text-zinc-400 hover:border-white/10'
                  }`}
                >
                  <Scissors className="w-4 h-4" />
                  <span className="text-xs font-bold">Single Clip</span>
                </button>

                <button
                  type="button"
                  onClick={() => setExportScope('selected_clips')}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between space-y-2 transition-all cursor-pointer ${
                    exportScope === 'selected_clips'
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 ring-1 ring-amber-500/30'
                      : 'bg-zinc-800/50 border-white/5 text-zinc-400 hover:border-white/10'
                  }`}
                >
                  <Film className="w-4 h-4" />
                  <span className="text-xs font-bold">Selected Clips</span>
                </button>

                <button
                  type="button"
                  onClick={() => setExportScope('all_clips')}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between space-y-2 transition-all cursor-pointer ${
                    exportScope === 'all_clips'
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 ring-1 ring-amber-500/30'
                      : 'bg-zinc-800/50 border-white/5 text-zinc-400 hover:border-white/10'
                  }`}
                >
                  <Copy className="w-4 h-4" />
                  <span className="text-xs font-bold">All Clips ({clips.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setExportScope('recipe')}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between space-y-2 transition-all cursor-pointer ${
                    exportScope === 'recipe'
                      ? 'bg-purple-500/10 border-purple-500/40 text-purple-300 ring-1 ring-purple-500/30'
                      : 'bg-zinc-800/50 border-white/5 text-zinc-400 hover:border-white/10'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span className="text-xs font-bold">Merge Recipe</span>
                </button>
              </div>

              {/* Target Picker Sub-views */}
              {exportScope === 'single_clip' && (
                <div className="pt-2">
                  <select
                    value={selectedClipId}
                    onChange={(e) => setSelectedClipId(e.target.value)}
                    className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    {clips.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({formatMsToTimestamp(c.durationMs)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {exportScope === 'selected_clips' && (
                <div className="pt-2 space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>{selectedBatchClipIds.length} of {clips.length} clips selected</span>
                    <div className="space-x-3">
                      <button type="button" onClick={selectAllClips} className="text-amber-400 hover:underline cursor-pointer">Select All</button>
                      <button type="button" onClick={deselectAllClips} className="text-zinc-400 hover:underline cursor-pointer">Clear</button>
                    </div>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-zinc-800/40 border border-white/5">
                    {clips.map((c) => (
                      <label
                        key={c.id}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                          selectedBatchClipIds.includes(c.id) ? 'bg-amber-500/10 text-white' : 'hover:bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={selectedBatchClipIds.includes(c.id)}
                            onChange={() => toggleBatchClip(c.id)}
                            className="rounded border-white/20 text-amber-500 focus:ring-0"
                          />
                          <span className="font-medium text-white">{c.name}</span>
                        </div>
                        <span className="font-mono text-zinc-500">{formatMsToTimestamp(c.durationMs)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {exportScope === 'recipe' && (
                <div className="pt-2">
                  <select
                    value={selectedRecipeId}
                    onChange={(e) => setSelectedRecipeId(e.target.value)}
                    className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    {recipes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.items.length} clips)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Step 2: Format & Encoding Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Output Format</label>
                <select
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value as any)}
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="mp4">MP4 Video (H.264 / AAC)</option>
                  <option value="mov">QuickTime MOV (Apple ProRes / H.264)</option>
                  <option value="webm">WebM Video (VP9 / Opus)</option>
                  <option value="mp3">MP3 Audio Only (320kbps)</option>
                  <option value="wav">WAV Audio Only (Uncompressed 24-bit)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Output Streams</label>
                <select
                  value={outputType}
                  onChange={(e) => setOutputType(e.target.value as any)}
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="video_and_audio">Video + Audio (Standard)</option>
                  <option value="video_only">Video Only (Mute)</option>
                  <option value="audio_only">Audio Only (Extract voice & music)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Quality Profile</label>
                <select
                  value={qualityProfile}
                  onChange={(e) => setQualityProfile(e.target.value as any)}
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="source">⚡ Lossless Source Copy (0 CPU transcode, millisecond speed)</option>
                  <option value="high">🌟 High Fidelity (CRF 18 / Master Quality)</option>
                  <option value="medium">⚖️ Balanced Production (CRF 23)</option>
                  <option value="fast">⚡ Fast Draft Render (CRF 28)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Resolution</label>
                <select
                  value={targetResolution}
                  onChange={(e) => setTargetResolution(e.target.value as any)}
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="source">Match Source Resolution</option>
                  <option value="1080p">1080p Full HD (1920x1080)</option>
                  <option value="720p">720p HD (1280x720)</option>
                  <option value="4k">4K UHD (3840x2160)</option>
                </select>
              </div>
            </div>

            {/* Audio Normalization & Filename */}
            <div className="pt-2 space-y-4">
              <label className="flex items-center space-x-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={normalizeAudio}
                  onChange={(e) => setNormalizeAudio(e.target.checked)}
                  className="rounded border-white/20 text-amber-500 focus:ring-0"
                />
                <span>Apply EBU R128 Audio Normalization (consistent loudness for Reels / Shorts)</span>
              </label>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Filename Pattern</label>
                <input
                  type="text"
                  value={filenameTemplate}
                  onChange={(e) => setFilenameTemplate(e.target.value)}
                  placeholder="{project}_{name}_{index}"
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                />
                <p className="text-[11px] text-zinc-500">
                  Preview: <span className="font-mono text-zinc-300">{previewFilename}</span>
                </p>
              </div>
            </div>

            {/* Trigger Button */}
            <button
              type="button"
              disabled={isSubmitting || clips.length === 0}
              onClick={handleStartExport}
              className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-zinc-950 font-bold text-sm shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              <span>
                {exportScope === 'single_clip' && 'Queue Single Clip Export'}
                {exportScope === 'selected_clips' && `Queue Selected Clips (${selectedBatchClipIds.length})`}
                {exportScope === 'all_clips' && `Queue All ${clips.length} Clips`}
                {exportScope === 'recipe' && 'Queue Merged Sequence Export'}
              </span>
            </button>
          </div>
        </div>

        {/* Right 5 Columns: Active Queue & Export Provenance Inspector */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 rounded-2xl bg-zinc-900 border border-white/10 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Export Jobs ({exportJobs.length})</h3>
              </div>

              <div className="flex items-center space-x-2">
                {/* Status Filter */}
                <select
                  value={queueFilter}
                  onChange={(e) => setQueueFilter(e.target.value as any)}
                  className="bg-zinc-800 text-[11px] text-zinc-300 rounded px-2 py-1 border border-white/10 focus:outline-none"
                >
                  <option value="all">All Jobs</option>
                  <option value="running">Running / Queued</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                </select>

                <button
                  type="button"
                  onClick={() => syncExportJobs()}
                  className="flex items-center space-x-1 text-xs text-zinc-400 hover:text-white cursor-pointer"
                  title="Refresh jobs from local engine"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {exportJobs.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-zinc-800 text-zinc-500 flex items-center justify-center mx-auto">
                  <Download className="w-6 h-6" />
                </div>
                <p className="text-xs text-zinc-400">No export jobs queued yet in this project.</p>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500">
                No jobs match the selected filter.
              </div>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {filteredJobs.map((job) => {
                  const isSelected = selectedExportJobId === job.id;
                  return (
                    <div
                      key={job.id}
                      onClick={() => selectExportJob(job.id)}
                      className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-zinc-800 border-amber-500/50 shadow-md ring-1 ring-amber-500/20'
                          : 'bg-zinc-950/60 border-white/5 hover:border-white/15'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 min-w-0">
                          <span className="text-xs font-bold text-white truncate max-w-[180px]">
                            {job.outputPath ? job.outputPath.split(/[/\\]/).pop() : job.id}
                          </span>
                        </div>

                        {/* Status Badge */}
                        <div className="flex items-center space-x-2">
                          {job.status === 'queued' && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-semibold border border-amber-500/20">
                              Queued
                            </span>
                          )}
                          {job.status === 'running' && (
                            <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-semibold border border-blue-500/20">
                              <ProgressCircle value={job.progressPercent} size={26} strokeWidth={3} label={`Export ${job.progressPercent}%`} className="text-blue-400" />
                            </span>
                          )}
                          {job.status === 'completed' && (
                            <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Done</span>
                            </span>
                          )}
                          {job.status === 'failed' && (
                            <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 text-[10px] font-semibold border border-rose-500/20">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Failed</span>
                            </span>
                          )}
                          {job.status === 'cancelled' && (
                            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-semibold">
                              Cancelled
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar for Running Job */}
                      {job.status === 'running' && (
                        <div className="mt-2.5 w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-cyan-400 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${job.progressPercent}%` }}
                          />
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px] text-zinc-400">
                        <span className="font-mono text-[10px]">
                          {job.sourceMappings.length} source clip{job.sourceMappings.length > 1 ? 's' : ''}
                        </span>

                        <div className="flex items-center space-x-2">
                          {job.status === 'completed' && getExportDownloadUrl(job.outputPath) && (
                            <a
                              href={getExportDownloadUrl(job.outputPath)!}
                              download={job.outputPath?.split(/[/\\]/).pop()}
                              onClick={event => event.stopPropagation()}
                              className="flex items-center gap-1 font-semibold text-amber-400 hover:text-amber-300"
                              title="Download exported file"
                            >
                              <Download className="h-3 w-3" />
                              <span>Download</span>
                            </a>
                          )}
                          {job.outputPath && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(job.outputPath || '');
                              }}
                              className="hover:text-white flex items-center space-x-1 cursor-pointer"
                              title="Copy full local path"
                            >
                              <Copy className="w-3 h-3" />
                              <span>{copiedPath === job.outputPath ? 'Copied' : 'Copy'}</span>
                            </button>
                          )}

                          {job.status === 'running' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelExportJob(job.id);
                              }}
                              className="text-rose-400 hover:text-rose-300 flex items-center space-x-1 cursor-pointer"
                            >
                              <XCircle className="w-3 h-3" />
                              <span>Cancel</span>
                            </button>
                          )}

                          {(job.status === 'failed' || job.status === 'cancelled') && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                retryExportJob(job.id);
                              }}
                              className="text-amber-400 hover:text-amber-300 flex items-center space-x-1 cursor-pointer"
                            >
                              <RotateCw className="w-3 h-3" />
                              <span>Retry</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteExportJob(job.id);
                            }}
                            className="text-zinc-500 hover:text-rose-400 cursor-pointer"
                            title="Remove job from list"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Source Mapping Provenance Drawer */}
          {selectedJob && (
            <div className="p-5 rounded-2xl bg-zinc-900 border border-white/10 space-y-3">
              <div className="flex items-center space-x-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                <Info className="w-4 h-4" />
                <span>Source Provenance & Dependencies</span>
              </div>

              <div className="text-xs text-zinc-400 space-y-2">
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-white/5 space-y-1">
                  <div className="text-zinc-500">Destination:</div>
                  <div className="font-mono text-zinc-300 break-all">{selectedJob.outputPath}</div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="text-zinc-400 font-semibold">Contributing Source Ranges:</div>
                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                    {selectedJob.sourceMappings.map((src, idx) => (
                      <div
                        key={src.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/40 border border-white/5 font-mono text-[11px]"
                      >
                        <span className="text-white">#{idx + 1} Clip {src.clipId?.slice(0, 8)}</span>
                        <span className="text-amber-400">
                          {formatMsToTimestamp(src.startMs)} → {formatMsToTimestamp(src.endMs)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
