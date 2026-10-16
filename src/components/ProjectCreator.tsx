'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, Sliders, FileVideo, Sparkles, AlertCircle, Music, Film } from 'lucide-react';
import { ProjectSettings } from '@/lib/types';

// Custom YouTube Icon SVG
const YouTubeIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

interface ProjectCreatorProps {
  onProjectCreated: (projectId: string) => void;
  onClose?: () => void;
}

export const ProjectCreator: React.FC<ProjectCreatorProps> = ({ onProjectCreated, onClose }) => {
  const [activeTab, setActiveTab] = useState<'video' | 'audio' | 'youtube'>('video');
  const [title, setTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Studio Settings
  const [settings, setSettings] = useState<ProjectSettings>({
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
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if ((activeTab === 'video' || activeTab === 'audio') && !selectedFile) {
      setError(`Please select or drop ${activeTab === 'audio' ? 'an audio' : 'a video'} file to upload.`);
      return;
    }

    if (activeTab === 'youtube' && !youtubeUrl.trim()) {
      setError('Please enter a public YouTube video URL.');
      return;
    }

    try {
      setIsSubmitting(true);

      const resolvedSourceType = activeTab === 'youtube' ? 'youtube' : activeTab === 'audio' ? 'audio' : 'upload';

      // Step 1: Create Project record
      const createRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || (activeTab === 'youtube' ? 'YouTube Video Clip Project' : selectedFile?.name),
          sourceType: resolvedSourceType,
          youtubeUrl: activeTab === 'youtube' ? youtubeUrl : undefined,
          durationLimit: settings.durationLimit,
          aspectRatio: settings.aspectRatio,
          normalizeAudio: settings.normalizeAudio,
          burnSubtitles: settings.burnSubtitles,
          subtitleStyle: settings.subtitleStyle,
        }),
      });

      const createData = await createRes.json();
      if (!createData.success) {
        throw new Error(createData.error || 'Failed to create project');
      }

      const projectId = createData.project.id;

      // Step 2: Upload file or register YouTube URL
      if ((activeTab === 'video' || activeTab === 'audio') && selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);

        const uploadRes = await fetch(`/api/projects/${projectId}/upload`, {
          method: 'POST',
          body: formData,
        });

        const uploadData = await uploadRes.json();
        if (!uploadData.success) {
          throw new Error(uploadData.error || `Failed to upload ${activeTab} file`);
        }
      } else if (activeTab === 'youtube') {
        const ytRes = await fetch(`/api/projects/${projectId}/youtube`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: youtubeUrl }),
        });

        const ytData = await ytRes.json();
        if (!ytData.success) {
          throw new Error(ytData.error || 'Failed to analyze YouTube URL');
        }
      }

      onProjectCreated(projectId);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
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
        <div className="grid grid-cols-3 gap-2 p-1.5 rounded-xl bg-zinc-900/80 border border-white/10 mb-6">
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
          <button
            type="button"
            onClick={() => {
              setActiveTab('youtube');
              setError(null);
            }}
            className={`flex items-center justify-center space-x-2 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'youtube'
                ? 'bg-zinc-100 text-zinc-950 shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <YouTubeIcon className="w-4 h-4" />
            <span className="hidden sm:inline">YouTube Public URL</span>
            <span className="sm:hidden">YouTube</span>
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

          {/* Tab 2: YouTube URL */}
          {activeTab === 'youtube' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">
                YouTube Video URL
              </label>
              <div className="relative">
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full px-4 py-3 rounded-xl bg-zinc-900/60 border border-white/10 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-white focus:ring-1 focus:ring-white/20 transition-colors pr-10"
                />
                <YouTubeIcon className="w-5 h-5 text-red-500 absolute right-3.5 top-3.5" />
              </div>
              <p className="text-xs text-zinc-400 mt-2">
                Gemini AI will analyze video semantics & timestamps. For local FFmpeg rendering, you can upload the corresponding authorized MP4 video file.
              </p>
            </div>
          )}

          {/* Collapsible Studio Settings */}
          <div className="border border-white/10 rounded-xl overflow-hidden bg-zinc-900/40">
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-300 hover:text-white transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-zinc-300" />
                <span>Studio Export Settings</span>
              </div>
              <span className="text-zinc-400 lowercase">{showSettings ? 'hide' : 'configure'}</span>
            </button>

            {showSettings && (
              <div className="p-4 border-t border-white/10 space-y-4 text-sm">
                {/* Max Duration Cap */}
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
                    Maximum Clip Duration (Capped at 60s)
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {(['15', '30', '45', '60', 'auto'] as const).map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => setSettings({ ...settings, durationLimit: dur })}
                        className={`py-2 px-2 text-xs font-medium rounded-lg border transition-all text-center ${
                          settings.durationLimit === dur
                            ? 'bg-white text-zinc-950 font-semibold border-white shadow-sm'
                            : 'bg-zinc-800/60 text-zinc-400 border-white/5 hover:text-white'
                        }`}
                      >
                        {dur === 'auto' ? 'Auto (Best)' : `≤ ${dur}s`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Aspect Ratio */}
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Aspect Ratio</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'original', label: 'Original' },
                      { id: 'vertical_crop', label: '9:16 Center Crop' },
                      { id: 'vertical_blur', label: '9:16 Blurred Blur' },
                    ].map((ar) => (
                      <button
                        key={ar.id}
                        type="button"
                        onClick={() => setSettings({ ...settings, aspectRatio: ar.id as any })}
                        className={`py-2 px-2 text-xs font-medium rounded-lg border transition-all text-center ${
                          settings.aspectRatio === ar.id
                            ? 'bg-white text-zinc-950 font-semibold border-white'
                            : 'bg-zinc-800/60 text-zinc-400 border-white/5 hover:text-white'
                        }`}
                      >
                        {ar.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Gemini Model Selector */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs text-zinc-400 font-medium">
                      Gemini AI Model (Speech & Clip Discovery)
                    </label>
                    <span className="text-[10px] text-sky-400 font-medium">Google GenAI</span>
                  </div>
                  <select
                    value={settings.aiModel || 'gemini-3.8-flash'}
                    onChange={(e) => setSettings({ ...settings, aiModel: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-white/10 text-white text-xs focus:outline-none focus:border-sky-400"
                  >
                    <option value="gemini-3.8-flash">Gemini 3.8 Flash (Default / Recommended - Ultra Fast)</option>
                    <option value="gemini-3.0-flash">Gemini 3.0 Flash (Next-Gen Performance)</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast & High Precision)</option>
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash (Production Standard - Multimodal)</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash (High Quota Limits)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro (Deep Reasoning & Nuance)</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (Frontier AI - Maximum Intelligence)</option>
                  </select>
                </div>

                {/* Toggles */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.normalizeAudio}
                      onChange={(e) => setSettings({ ...settings, normalizeAudio: e.target.checked })}
                      className="w-4 h-4 rounded bg-zinc-800 border-white/20 text-zinc-900 focus:ring-0"
                    />
                    <span className="text-xs text-zinc-300">Normalize Audio (loudnorm)</span>
                  </label>
                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.burnSubtitles}
                      onChange={(e) => setSettings({ ...settings, burnSubtitles: e.target.checked })}
                      className="w-4 h-4 rounded bg-zinc-800 border-white/20 text-zinc-900 focus:ring-0"
                    />
                    <span className="text-xs text-zinc-300">Burn Subtitles into Video</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex items-center justify-end space-x-3 pt-2">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
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
                  <div className="w-4 h-4 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Launch Project</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
