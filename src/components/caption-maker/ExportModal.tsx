'use strict';
'use client';

import React, { useState } from 'react';
import { CaptionProject } from '@/lib/caption-maker/types';
import {
  X,
  Download,
  FileText,
  Film,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Play,
  Share2,
} from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: CaptionProject;
  onStartRender: () => Promise<void>;
  isRendering: boolean;
  renderProgress: number; // 0 to 100
  renderStatusText: string;
  renderResult: {
    videoUrl?: string;
    srtUrl?: string;
    error?: string;
  } | null;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  project,
  onStartRender,
  isRendering,
  renderProgress,
  renderStatusText,
  renderResult,
}) => {
  const [srtMode, setSrtMode] = useState<'phrase' | 'word'>('phrase');

  if (!isOpen) return null;

  const handleDownloadSrt = () => {
    // We can also trigger direct download from client side via blob
    if (renderResult?.srtUrl && srtMode === 'phrase') {
      window.open(renderResult.srtUrl, '_blank');
      return;
    }

    // Dynamic SRT generation from project transcript in client
    import('@/lib/caption-maker/srt-generator').then(
      ({ generatePhraseSRT, generateWordLevelSRT }) => {
        const srtContent =
          srtMode === 'word'
            ? generateWordLevelSRT(project.transcript)
            : generatePhraseSRT(project.captionGroups);

        const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.title || 'caption_reel'}_${srtMode}.srt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    );
  };

  const handleDownloadVideo = () => {
    if (!renderResult?.videoUrl) return;
    const a = document.createElement('a');
    a.href = renderResult.videoUrl;
    a.download = `${project.title || 'reel'}_final.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 bg-zinc-950/80 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-amber-400" />
            <h3 className="font-semibold text-zinc-100 text-base">
              Export & Render Reel Video
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isRendering}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {/* State 1: Rendering in progress */}
          {isRendering && (
            <div className="text-center py-8 space-y-4">
              <div className="relative w-16 h-16 mx-auto">
                <Loader2 className="w-16 h-16 text-amber-400 animate-spin" />
                <span className="absolute inset-0 flex items-center justify-center font-mono text-xs font-bold text-amber-300">
                  {renderProgress}%
                </span>
              </div>
              <div>
                <h4 className="text-zinc-100 font-semibold text-lg">
                  Rendering Your Video...
                </h4>
                <p className="text-zinc-400 text-sm mt-1">{renderStatusText}</p>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-zinc-950 rounded-full h-2.5 overflow-hidden border border-zinc-800">
                <div
                  className="bg-gradient-to-r from-amber-500 to-amber-300 h-full transition-all duration-300"
                  style={{ width: `${renderProgress}%` }}
                />
              </div>

              <p className="text-zinc-500 text-xs">
                FFmpeg is compositing image, audio, and animated ASS captions. This may take a few moments.
              </p>
            </div>
          )}

          {/* State 2: Error occurred */}
          {!isRendering && renderResult?.error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-3">
              <div className="flex items-center gap-2.5 text-rose-400">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <h4 className="font-semibold text-sm">Rendering Failed</h4>
              </div>
              <p className="text-xs text-rose-300/90 leading-relaxed font-mono">
                {renderResult.error}
              </p>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  onClick={onStartRender}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-xs transition-colors"
                >
                  Retry Render
                </button>
              </div>
            </div>
          )}

          {/* State 3: Render Complete! */}
          {!isRendering && renderResult?.videoUrl && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
                <h4 className="font-semibold text-base">Video Rendered Successfully!</h4>
              </div>

              {/* Video Player Preview */}
              <div className="rounded-xl overflow-hidden bg-black border border-zinc-800 aspect-video max-h-72 flex items-center justify-center">
                <video
                  src={renderResult.videoUrl}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  onClick={handleDownloadVideo}
                  className="flex items-center justify-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-sm transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98]"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  Download Final MP4
                </button>

                <div className="flex items-center gap-2">
                  <select
                    value={srtMode}
                    onChange={(e) => setSrtMode(e.target.value as 'phrase' | 'word')}
                    className="bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-xl px-2 py-3 text-xs focus:outline-none"
                  >
                    <option value="phrase">Phrase SRT</option>
                    <option value="word">Word SRT</option>
                  </select>

                  <button
                    onClick={handleDownloadSrt}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold rounded-xl text-sm border border-zinc-700 transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    Download SRT
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* State 4: Ready to Render / Pre-flight details */}
          {!isRendering && !renderResult?.videoUrl && !renderResult?.error && (
            <div className="space-y-4">
              <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-xl space-y-3">
                <h4 className="text-zinc-200 font-semibold text-sm">
                  Video Specifications
                </h4>
                <div className="grid grid-cols-2 gap-y-2 text-xs text-zinc-400">
                  <div>
                    <span className="text-zinc-500 block">Preset:</span>
                    <span className="text-zinc-200 font-medium capitalize">
                      {project.outputSettings.preset.replace('-', ' ')}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Resolution:</span>
                    <span className="text-zinc-200 font-mono">
                      {project.outputSettings.width} × {project.outputSettings.height} (
                      {project.outputSettings.aspectRatio})
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Quality / FPS:</span>
                    <span className="text-zinc-200 font-medium capitalize">
                      {project.outputSettings.quality} @ {project.outputSettings.fps} fps
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Audio Duration:</span>
                    <span className="text-zinc-200 font-mono">
                      {project.audio ? `${project.audio.duration.toFixed(2)}s` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {!project.image && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300">
                  ⚠️ No background image selected. A solid studio dark background will be used.
                </div>
              )}

              {!project.audio && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                  ⚠️ Audio file missing. Please upload an audio track before rendering.
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onStartRender}
                  disabled={!project.audio}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20 disabled:opacity-40"
                >
                  Start FFmpeg Render
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
