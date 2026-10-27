'use client';

import React, { useRef } from 'react';
import {
  Play,
  BrainCircuit,
  Download,
  Clock,
  Maximize2,
  Volume2,
  AlertCircle,
  Layers,
  Upload,
  X,
  CheckCircle2,
  Music,
  ChevronDown,
  Cpu,
} from 'lucide-react';
import { Project } from '@/lib/types';
import { ProgressCircle, UploadProgressIndicator } from '@/components/ProgressCircle';

interface ProjectHeaderProps {
  project: Project;
  onRunAnalysis: () => void;
  onRenderAllSelected: () => void;
  onExportZip: () => void;
  onUploadLocalFileForYouTube: (file: File) => void;
  onCancelLocalFileUpload: () => void;
  isUploadingLocalFile: boolean;
  localUploadProgress: number;
  isAnalyzing: boolean;
  isRendering: boolean;
  onOpenOllamaModal?: () => void;
  onOpenGeminiModal?: () => void;
}

export const ProjectHeader: React.FC<ProjectHeaderProps> = ({
  project,
  onRunAnalysis,
  onRenderAllSelected,
  onExportZip,
  onUploadLocalFileForYouTube,
  onCancelLocalFileUpload,
  isUploadingLocalFile,
  localUploadProgress,
  isAnalyzing,
  isRendering,
  onOpenOllamaModal,
  onOpenGeminiModal,
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
    <div className="w-full glass-panel rounded-2xl p-5 sm:p-7 border border-white/10 shadow-xl space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Title and Metadata */}
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight break-words [overflow-wrap:anywhere]">
              {project.title}
            </h2>
            <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${getStatusColor(project.status)}`}>
              {project.status === 'COMPLETED' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
              <span>{project.status} {project.status === 'COMPLETED' ? '100%' : ''}</span>
            </span>
          </div>

          {/* Video / Audio Metadata badges */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
            {project.videoMetadata ? (
              (!project.videoMetadata.videoCodec && project.videoMetadata.hasAudio) || project.sourceType === 'audio' ? (
                <>
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Duration: {Math.round(project.videoMetadata.duration)}s</span>
                  </span>
                  <span className="flex items-center space-x-1 text-amber-400">
                    <Music className="w-3.5 h-3.5 text-amber-400" />
                    <span>Audio Project ({project.videoMetadata.audioCodec || 'Stereo'})</span>
                  </span>
                  <span className="flex items-center space-x-1 text-emerald-400">
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Speech Track Ready</span>
                  </span>
                </>
              ) : (
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
              )
            ) : project.youtubeUrl ? (
              <span className="text-red-400">YouTube Source: {project.youtubeUrl}</span>
            ) : (
              <span>Inspecting media streams...</span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {project.candidates.length === 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onOpenOllamaModal || onOpenGeminiModal}
                title="Choose Ollama Model for Analysis"
                className="flex items-center space-x-1.5 px-3 py-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 hover:border-amber-400/40 text-xs text-zinc-200 transition-all group cursor-pointer shadow-sm"
              >
                <Cpu className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform flex-shrink-0" />
                <span className="font-semibold text-white">
                  {project.settings?.aiModel || 'llama3.2'}
                </span>
                <ChevronDown className="w-3 h-3 text-zinc-400 group-hover:text-white transition-colors" />
              </button>

              <button
                onClick={onRunAnalysis}
                disabled={isAnalyzing || isYouTubeMissingLocal}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 disabled:bg-amber-400/10 disabled:text-amber-200 disabled:border-amber-400/30 disabled:cursor-default border border-transparent text-zinc-950 font-semibold text-sm shadow-lg shadow-white/5 transition-all"
              >
                {isAnalyzing ? (
                  <>
                    <ProgressCircle value={project.progress} size={26} strokeWidth={3.5} label="Video analysis" className="text-amber-300" />
                    <span>Analysis running</span>
                  </>
                ) : (
                  <>
                    <BrainCircuit className="w-4 h-4" />
                    <span>Run Full AI Analysis</span>
                  </>
                )}
              </button>
            </div>
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
                AI has analyzed the timestamps. To cut clips and burn subtitles locally, please attach the authorized video file.
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
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) onUploadLocalFileForYouTube(file);
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingLocalFile}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-zinc-950 font-bold text-xs sm:text-sm whitespace-nowrap shadow-md shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              {isUploadingLocalFile ? (
                <UploadProgressIndicator progress={localUploadProgress} size={26} label="Local source video upload" className="text-zinc-950" processing={localUploadProgress >= 100} />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span>
                {isUploadingLocalFile
                  ? localUploadProgress >= 100
                    ? 'Processing video…'
                    : `Uploading (${localUploadProgress}%)...`
                  : 'Attach Local Video'}
              </span>
            </button>
            {isUploadingLocalFile && (
              <button
                type="button"
                onClick={onCancelLocalFileUpload}
                className="mt-2 inline-flex items-center justify-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-semibold text-red-300 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <X className="h-3 w-3" />
                Cancel upload
              </button>
            )}
          </div>
        </div>
      )}

      {project.sourceType === 'youtube' && project.localVideoPath && (
        <div role="status" className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-950/30 px-3 py-2 text-xs font-semibold text-emerald-300">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Local source video ready
        </div>
      )}

      {/* Progress Bar & Status message */}
      {!isAnalyzing && (project.status !== 'COMPLETED' || project.statusMessage) && (
        <div className="space-y-2 p-3.5 rounded-xl bg-zinc-900/60 border border-white/5">
          <div className="flex items-center justify-between text-xs text-zinc-300">
            <span className="flex items-center space-x-2 font-medium">
              {project.status !== 'COMPLETED' && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
                </span>
              )}
              <span className="text-zinc-200">{project.statusMessage || 'Processing...'}</span>
            </span>
            <span className="font-bold text-white bg-white/10 px-2 py-0.5 rounded-md text-[11px]">
              {project.progress}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-zinc-950 border border-white/10 overflow-hidden p-0.5">
            <div
              className={`h-full bg-gradient-to-r from-rose-500 via-indigo-500 via-sky-400 to-emerald-400 transition-all duration-500 rounded-full ${
                project.status !== 'COMPLETED' ? 'animate-pulse' : ''
              }`}
              style={{ width: `${Math.max(2, project.progress)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
