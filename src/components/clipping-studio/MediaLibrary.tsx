'use client';

import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  Film,
  Trash2,
  AlertTriangle,
  Link2,
  Play,
  FileVideo,
  FileAudio,
  X,
  CheckCircle2,
} from 'lucide-react';
import { useClippingStore } from '@/lib/clipping-studio/use-clipping-store';
import { formatMsToTimestamp, MediaAsset } from '@/lib/clipping-studio/contracts';
import { UploadProgressIndicator } from '@/components/ProgressCircle';
import { uploadFileWithProgress, UploadCancelledError } from '@/lib/upload-with-progress';

export const MediaLibrary: React.FC = () => {
  const {
    activeProject,
    selectedAssetId,
    selectAsset,
    addMediaAsset,
    removeMediaAsset,
    relinkMediaAsset,
    setActiveTab,
  } = useClippingStore();

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [relinkingAssetId, setRelinkingAssetId] = useState<string | null>(null);
  const [newRelinkPath, setNewRelinkPath] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortController = useRef<AbortController | null>(null);

  const handleFileUpload = async (file: File) => {
    if (!activeProject || uploadAbortController.current) return;
    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    const controller = new AbortController();
    uploadAbortController.current = controller;

    try {
      const data = await uploadFileWithProgress<{
        success?: boolean;
        error?: string;
        asset?: MediaAsset;
      }>(`/api/clipping-studio/projects/${activeProject.id}/media`, file, setUploadProgress, undefined, controller.signal);
      if (!data.success || !data.asset) {
        throw new Error(data.error || 'Failed to import media file');
      }

      addMediaAsset(data.asset);
      setUploadProgress(100);
    } catch (err: any) {
      if (err instanceof UploadCancelledError) {
        setUploadProgress(0);
        setUploadError(null);
      } else {
        setUploadError(err.message || 'Media import failed');
      }
    } finally {
      uploadAbortController.current = null;
      setIsUploading(false);
    }
  };

  const handleRelink = async (assetId: string) => {
    if (!activeProject || !newRelinkPath.trim()) return;
    try {
      const res = await fetch(`/api/clipping-studio/projects/${activeProject.id}/media`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId, newPath: newRelinkPath.trim() }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to relink file');
      }

      relinkMediaAsset(assetId, data.updatedPath, data.fileSizeBytes, data.durationMs);
      setRelinkingAssetId(null);
      setNewRelinkPath('');
    } catch (err: any) {
      alert(`Relink error: ${err.message}`);
    }
  };

  const mediaAssets = activeProject?.mediaAssets || [];

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div className="w-full">
        <div
          onClick={() => {
            if (!isUploading) fileInputRef.current?.click();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files?.[0]) {
              handleFileUpload(e.dataTransfer.files[0]);
            }
          }}
          className="border-2 border-dashed border-white/15 hover:border-amber-400/50 bg-zinc-900/40 hover:bg-zinc-900/70 rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-3 min-h-[150px]"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/mkv,audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,audio/m4a,audio/flac"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) handleFileUpload(file);
            }}
            className="hidden"
          />
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
            {isUploading ? (
              <UploadProgressIndicator progress={uploadProgress} processing={uploadProgress >= 100} size={36} strokeWidth={3.5} label="Media upload and inspection" />
            ) : (
              <UploadCloud className="w-6 h-6" />
            )}
          </div>
          <div>
            <p className="text-sm font-bold text-white">
              {isUploading
                ? uploadProgress >= 100
                  ? 'Inspecting media with FFprobe…'
                  : `Uploading Media (${uploadProgress}%)...`
                : 'Drop video or audio file here, or browse'}
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              Supports MP4, MOV, WEBM, MKV, AVI, MP3, WAV, M4A, AAC, OGG (Original remains untouched)
            </p>
            {isUploading && uploadProgress < 100 && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  uploadAbortController.current?.abort();
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold text-red-300 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <X className="h-3 w-3" />
                Cancel upload
              </button>
            )}
          </div>
        </div>
      </div>

      {uploadError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Media Assets List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-300">
            Imported Media Sources ({mediaAssets.length})
          </h3>
          <span className="text-xs text-zinc-500">Click a media source to load it into the timeline</span>
        </div>

        {mediaAssets.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-xl bg-zinc-900/20 border border-white/5 space-y-2">
            <Film className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-xs text-zinc-400">No media sources imported yet. Upload or link your first media file above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {mediaAssets.map((asset) => {
              const isSelected = selectedAssetId === asset.id;
              const isRelinking = relinkingAssetId === asset.id;
              const meta = asset.metadata;

              return (
                <div
                  key={asset.id}
                  className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 ${
                    isSelected
                      ? 'bg-zinc-900 border-amber-500/50 shadow-md shadow-amber-500/5 ring-1 ring-amber-500/30'
                      : 'bg-zinc-900/50 hover:bg-zinc-900/80 border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between space-x-3">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          meta.hasVideo
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                        }`}
                      >
                        {meta.hasVideo ? <FileVideo className="w-5 h-5" /> : <FileAudio className="w-5 h-5" />}
                      </div>
                      <div className="overflow-hidden">
                        <h4
                          onClick={() => {
                            selectAsset(asset.id);
                            setActiveTab('timeline');
                          }}
                          className="text-sm font-bold text-white hover:text-amber-400 cursor-pointer truncate max-w-[280px]"
                          title={asset.filename}
                        >
                          {asset.filename}
                        </h4>
                        <p className="text-[11px] text-zinc-400 truncate max-w-[280px]" title={asset.localPath}>
                          {asset.localPath}
                        </p>
                      </div>
                    </div>

                    <CheckCircle2
                      className="h-4 w-4 shrink-0 text-emerald-400"
                      aria-label="Media upload complete"
                      role="img"
                    />

                    {isSelected && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                        Active Timeline Source
                      </span>
                    )}
                  </div>

                  {/* Metadata Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-300">
                    <span className="px-2 py-0.5 rounded bg-zinc-950 border border-white/5 font-mono">
                      {formatMsToTimestamp(meta.durationMs)}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-zinc-950 border border-white/5">
                      {(asset.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
                    </span>
                    {meta.width && meta.height && (
                      <span className="px-2 py-0.5 rounded bg-zinc-950 border border-white/5">
                        {meta.width}x{meta.height} ({meta.fps || 30} fps)
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded bg-zinc-950 border border-white/5 uppercase">
                      {meta.videoCodec || meta.audioCodec || meta.formatName}
                    </span>
                    {meta.audioCodec && (
                      <span className="px-2 py-0.5 rounded bg-zinc-950 border border-white/5">
                        Audio: {meta.audioCodec}
                      </span>
                    )}
                  </div>

                  {/* Relinking Prompt */}
                  {isRelinking && (
                    <div className="p-2.5 rounded-lg bg-zinc-950 border border-amber-500/40 space-y-2">
                      <span className="text-[11px] text-amber-300 block font-semibold">
                        Enter new local file path on PC:
                      </span>
                      <div className="flex items-center space-x-1.5">
                        <input
                          type="text"
                          value={newRelinkPath}
                          onChange={(e) => setNewRelinkPath(e.target.value)}
                          placeholder="C:\NewLocation\file.mp4"
                          className="flex-1 px-2 py-1 text-xs bg-zinc-900 border border-white/10 rounded text-white"
                        />
                        <button
                          type="button"
                          onClick={() => handleRelink(asset.id)}
                          className="px-2.5 py-1 text-[11px] bg-amber-400 text-zinc-950 font-bold rounded"
                        >
                          Relink
                        </button>
                        <button
                          type="button"
                          onClick={() => setRelinkingAssetId(null)}
                          className="px-2 py-1 text-[11px] bg-zinc-800 text-zinc-400 rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => {
                        setRelinkingAssetId(asset.id);
                        setNewRelinkPath(asset.localPath);
                      }}
                      className="flex items-center space-x-1 text-[11px] text-zinc-400 hover:text-white transition-colors"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>Relink Path</span>
                    </button>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Remove media source "${asset.filename}" and its associated clips?`)) {
                            removeMediaAsset(asset.id);
                          }
                        }}
                        title="Remove media source"
                        className="p-1 rounded text-zinc-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          selectAsset(asset.id);
                          setActiveTab('timeline');
                        }}
                        className={`flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                          isSelected
                            ? 'bg-amber-400 text-zinc-950 shadow-sm'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                        }`}
                      >
                        <Play className="w-3 h-3" />
                        <span>{isSelected ? 'Open Timeline' : 'Load Source'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
