'use client';

import React, { useRef } from 'react';
import {
  Play,
  Sparkles,
  Download,
  Clock,
  Maximize2,
  Volume2,
  AlertCircle,
  Layers,
  Upload,
  CheckCircle2,
} from 'lucide-react';
import { Project } from '@/lib/types';

interface ProjectHeaderProps {
  project: Project;
  onRunAnalysis: () => void;
  onRenderAllSelected: () => void;
  onExportZip: () => void;
  onUploadLocalFileForYouTube: (file: File) => void;
  isAnalyzing: boolean;
  isRendering: boolean;
}

export const ProjectHeader: React.FC<ProjectHeaderProps> = ({
  project,
  onRunAnalysis,
  onRenderAllSelected,
  onExportZip,
  onUploadLocalFileForYouTube,
  isAnalyzing,
  isRendering,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getStatusColor = (status: Project['status']) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'TRANSCRIBING':
      case 'ANALYZING':
      case 'RANKING':
      case 'VERIFYING':
        return 'bg-white/10 text-white border-white/20';
      case 'RENDERING':
      case 'VALIDATING':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'FAILED':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      default:
        return 'bg-zinc-800 text-zinc-300 border-white/10';
    }
  };

  const selectedCount = project.candidates.filter(c => c.selected).length;
  const renderedCount = project.candidates.filter(c => c.renderStatus === 'completed').length;
  const isYouTubeMissingLocal = project.sourceType === 'youtube' && !project.localVideoPath;

  return (
    <div className="w-full glass-panel rounded-2xl p-6 border border-white/10 shadow-xl space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Title and Metadata */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {project.title}
            </h2>
            <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${getStatusColor(project.status)}`}>
              {project.status === 'COMPLETED' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
              <span>{project.status} {project.status === 'COMPLETED' ? '100%' : ''}</span>
            </span>
          </div>

          {/* Video Metadata badges */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
            {project.videoMetadata ? (
              <>
                <span className="flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Duration: {Math.round(project.videoMetadata.duration)}s</span>
                </span>
                <span className="flex items-center space-x-1">
                  <Maximize2 className="w-3.5 h-3.5 text-zinc-400" />
                  <span>
                    {project.videoMetadata.width}x{project.videoMetadata.height} ({project.videoMetadata.aspectRatio})
                  </span>
                </span>
                <span className="flex items-center space-x-1">
                  <Layers className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{project.videoMetadata.fps} FPS</span>
                </span>
                <span className="flex items-center space-x-1">
                  <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{project.videoMetadata.hasAudio ? 'Stereo Audio' : 'No Audio'}</span>
                </span>
              </>
            ) : project.youtubeUrl ? (
              <span className="text-red-400">YouTube Source: {project.youtubeUrl}</span>
            ) : (
              <span>Inspecting video streams...</span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {project.candidates.length === 0 ? (
            <button
              onClick={onRunAnalysis}
              disabled={isAnalyzing || isYouTubeMissingLocal}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 disabled:opacity-50 text-zinc-950 font-semibold text-sm shadow-lg shadow-white/5 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isAnalyzing ? 'Analyzing Video...' : 'Run Full AI Analysis'}</span>
            </button>
          ) : (
            <>
              <button
                onClick={onRenderAllSelected}
                disabled={isRendering || selectedCount === 0 || isYouTubeMissingLocal}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 disabled:opacity-50 text-zinc-950 font-semibold text-xs sm:text-sm transition-all shadow-sm"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  {isRendering ? 'Rendering Clips...' : `Render Selected (${selectedCount})`}
                </span>
              </button>

              <button
                onClick={onExportZip}
                disabled={renderedCount === 0}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 font-medium text-xs sm:text-sm transition-all border border-white/10"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export ZIP ({renderedCount})</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Notice if YouTube Source needs local media */}
      {isYouTubeMissingLocal && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs sm:text-sm shadow-lg shadow-amber-950/20">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-400">Local Source Video File Needed for FFmpeg Rendering</p>
              <p className="text-zinc-300 text-xs mt-0.5 leading-relaxed">
                Gemini has analyzed the timestamps. To cut clips and burn subtitles locally, please attach the authorized video file.
              </p>
            </div>
          </div>
          <div className="flex-shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  onUploadLocalFileForYouTube(e.target.files[0]);
                }
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs sm:text-sm whitespace-nowrap shadow-md shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Upload className="w-4 h-4" />
              <span>Attach Local Video</span>
            </button>
          </div>
        </div>
      )}

      {/* Progress Bar & Status message */}
      {(project.status !== 'COMPLETED' || project.statusMessage) && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>{project.statusMessage || 'Processing...'}</span>
            <span className="font-semibold text-white">{project.progress}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-zinc-900 border border-white/5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-rose-500 via-indigo-500 via-sky-400 to-emerald-400 transition-all duration-300 rounded-full"
              style={{ width: `${Math.max(2, project.progress)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
