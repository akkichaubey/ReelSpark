'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, FileVideo, FolderPlus, AlertCircle, Music, Film, X, Loader2 } from 'lucide-react';
import { ProjectSettings } from '@/lib/types';
import { ProgressCircle } from '@/components/ProgressCircle';
import { readJsonResponse, uploadFileWithProgress, UploadCancelledError } from '@/lib/upload-with-progress';

interface ProjectCreatorProps {
  onProjectCreated: (projectId: string) => void;
  onClose?: () => void;
}

export const ProjectCreator: React.FC<ProjectCreatorProps> = ({ onProjectCreated, onClose }) => {
  const [activeTab, setActiveTab] = useState<'video' | 'audio'>('video');
  const [title, setTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submitStage, setSubmitStage] = useState<'idle' | 'creating' | 'uploading' | 'finalizing'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Studio Settings (Defaults)
  const [settings] = useState<ProjectSettings>({
    durationLimit: '60',
    aspectRatio: 'original',
    normalizeAudio: true,
    burnSubtitles: false,
    aiModel: 'gemini-3.8-flash',
    subtitleStyle: {
      fontSize: 28,
      fontColor: '#FFFFFF',
      outlineColor: '#000000',
      outlineWidth: 3,
      verticalPosition: 'bottom',
      alignment: 'center',
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortController = useRef<AbortController | null>(null);

  const audioExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'];
  const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];

  const processSelectedFile = (file: File) => {
    setSelectedFile(file);
    if (!title) {
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
    }
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (audioExtensions.includes(ext) && activeTab === 'video') {
      setActiveTab('audio');
    } else if (videoExtensions.includes(ext) && activeTab === 'audio') {
      setActiveTab('video');
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) processSelectedFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    if (!selectedFile) {
      setError(`Please select or drop ${activeTab === 'audio' ? 'an audio' : 'a video'} file to upload.`);
      return;
    }

    let createdProjectId: string | null = null;
    try {
      setIsSubmitting(true);
      setSubmitProgress(0);
      setSubmitStage('creating');

      const resolvedSourceType = activeTab === 'audio' ? 'audio' : 'upload';

      // Step 1: Create Project record
      const createRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || selectedFile?.name,
          sourceType: resolvedSourceType,
          durationLimit: settings.durationLimit,
          aspectRatio: settings.aspectRatio,
          normalizeAudio: settings.normalizeAudio,
          burnSubtitles: settings.burnSubtitles,
          subtitleStyle: settings.subtitleStyle,
        }),
      });

      const createData = await readJsonResponse<{
        success: boolean;
        error?: string;
        project?: { id: string };
      }>(createRes);
      if (!createData.success) {
        throw new Error(createData.error || 'Failed to create project');
      }

      const projectId = createData.project?.id;
      if (!projectId) throw new Error('The server created no project ID. Please retry.');
      createdProjectId = projectId;

      // Step 2: Upload file
      setSubmitStage('uploading');
      setSubmitProgress(0);
      const controller = new AbortController();
      uploadAbortController.current = controller;
      const uploadData = await uploadFileWithProgress<{
        success: boolean;
        error?: string;
      }>(`/api/projects/${projectId}/upload`, selectedFile, (uploadPercent) => {
        setSubmitProgress(uploadPercent);
        if (uploadPercent >= 100) setSubmitStage('finalizing');
      }, undefined, controller.signal);
      if (!uploadData.success) {
        throw new Error(uploadData.error || `Failed to upload ${activeTab} file`);
      }

      setSubmitProgress(100);
      onProjectCreated(projectId);
    } catch (err: any) {
      if (err instanceof UploadCancelledError) {
        let draftRemoved = false;
        if (createdProjectId) {
          try {
            const response = await fetch(`/api/projects/${createdProjectId}`, { method: 'DELETE' });
            draftRemoved = response.ok;
          } catch {
            draftRemoved = false;
          }
        }
        setError(createdProjectId
          ? draftRemoved
            ? 'Upload cancelled. The incomplete project was removed.'
            : 'Upload cancelled. The incomplete project may still appear in your projects.'
            : 'Upload cancelled.');
      } else {
        setError(err.message || 'An unexpected error occurred');
      }
    } finally {
      uploadAbortController.current = null;
      setIsSubmitting(false);
      setSubmitStage('idle');
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto glass-panel rounded-2xl p-6 sm:p-8 border border-white/10 shadow-2xl relative overflow-hidden">
      {/* Background Accent glow */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-white/[0.03] rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-white/[0.02] rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

      <div className="relative z-10">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-extrabold text-white tracking-tight sm:text-3xl">
            Create New Clip Project
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Extract motivational, philosophical, and meaningful clips under 60 seconds with timestamped subtitles
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-xl bg-zinc-900/80 border border-white/10 mb-6">
          <button
            type="button"
            onClick={() => {
              setActiveTab('video');
              setError(null);
            }}
            className={`flex items-center justify-center space-x-2 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'video'
                ? 'bg-white text-zinc-950 shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Film className="w-4 h-4" />
            <span className="hidden sm:inline">Upload Video File</span>
            <span className="sm:hidden">Video</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('audio');
              setError(null);
            }}
            className={`flex items-center justify-center space-x-2 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'audio'
                ? 'bg-white text-zinc-950 shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Music className="w-4 h-4" />
            <span className="hidden sm:inline">Upload Audio File</span>
            <span className="sm:hidden">Audio</span>
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Unable to process input</p>
              <p className="text-xs text-red-300/80 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Project Title */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">
              Project Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Osho: Overcoming Fear and Living in Totality"
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-900/60 border border-white/10 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-white focus:ring-1 focus:ring-white/20 transition-colors"
            />
          </div>

          {/* Tab 1: Upload Video */}
          {activeTab === 'video' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">
                Video File
              </label>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  selectedFile
                    ? 'border-white/50 bg-white/5'
                    : 'border-white/15 hover:border-white/40 bg-zinc-900/40 hover:bg-zinc-900/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {selectedFile ? (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-xl bg-white/10 text-white flex items-center justify-center mb-3">
                      <FileVideo className="w-6 h-6" />
                    </div>
                    <p className="text-white font-medium text-sm">{selectedFile.name}</p>
                    <p className="text-xs text-zinc-400 mt-1">
                      {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB • Click to replace
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-xl bg-zinc-800 text-zinc-400 flex items-center justify-center mb-3">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-medium text-zinc-200">
                      Drag and drop your speech or interview video here, or <span className="text-white underline">browse</span>
                    </p>
                    <p className="text-xs text-zinc-500 mt-2">
                      Supports MP4, MOV, WEBM, AVI, MKV (Keeps original file untouched)
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Upload Audio */}
          {activeTab === 'audio' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">
                Audio File (Speech / Podcast / Interview)
              </label>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  selectedFile
                    ? 'border-white/50 bg-white/5'
                    : 'border-white/15 hover:border-white/40 bg-zinc-900/40 hover:bg-zinc-900/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,audio/m4a,audio/flac,audio/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {selectedFile ? (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/15 text-amber-300 flex items-center justify-center mb-3 border border-amber-500/30">
                      <Music className="w-6 h-6 text-amber-400" />
                    </div>
                    <p className="text-white font-medium text-sm">{selectedFile.name}</p>
                    <p className="text-xs text-zinc-400 mt-1">
                      {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB • Click to replace
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-xl bg-zinc-800 text-zinc-400 flex items-center justify-center mb-3">
                      <Music className="w-6 h-6 text-amber-400" />
                    </div>
                    <p className="text-sm font-medium text-zinc-200">
                      Drag and drop your speech, podcast, or interview audio here, or <span className="text-white underline">browse</span>
                    </p>
                    <p className="text-xs text-zinc-500 mt-2">
                      Supports MP3, WAV, M4A, AAC, OGG, FLAC (Keeps original file untouched)
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex items-center justify-end space-x-3 pt-2">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-white hover:bg-zinc-200 disabled:opacity-50 text-zinc-950 font-semibold text-sm shadow-lg shadow-white/5 transition-all"
            >
              {isSubmitting ? (
                <>
                  {submitStage === 'creating' ? (
                    <Loader2 className="h-[30px] w-[30px] animate-spin text-zinc-900" aria-hidden="true" />
                  ) : (
                    <ProgressCircle
                      value={submitProgress}
                      size={30}
                      strokeWidth={3.5}
                      label="File transfer"
                      className="text-zinc-900"
                    />
                  )}
                  <span aria-live="polite">
                    {submitStage === 'creating'
                      ? 'Preparing project…'
                      : submitStage === 'finalizing'
                      ? 'Checking uploaded media…'
                      : submitProgress >= 100
                      ? 'Finishing upload…'
                      : `Uploading (${submitProgress}%)...`}
                  </span>
                </>
              ) : (
                <>
                  <FolderPlus className="w-4 h-4" />
                  <span>Launch Project</span>
                </>
              )}
            </button>
            {submitStage === 'uploading' && submitProgress < 100 && (
              <button
                type="button"
                onClick={() => uploadAbortController.current?.abort()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <X className="h-3.5 w-3.5" />
                Cancel upload
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
