'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Upload,
  Check,
  AlertCircle,
  ExternalLink,
  RotateCw,
  Video,
  Layers,
  Captions,
  Link as LinkIcon,
  Globe,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Play,
} from 'lucide-react';
import {
  PublishingPlatformKey,
  SafeOAuthConnection,
  VideoAssetForPublishing,
  SocialPublishingJob,
  PlatformPublishContentPayload,
} from '@/lib/social-intelligence/publishing-types';
import { validateVideoForPlatform } from '@/lib/social-intelligence/video-validator';
import { SocialPlatformIcon } from '@/components/social-intelligence/SocialPlatformIcon';
import { OAuthCredentialsModal } from './OAuthCredentialsModal';
import { ProgressCircle } from '@/components/ProgressCircle';

interface PublishStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultVideoPath?: string;
  defaultThumbnailPath?: string;
  defaultTitle?: string;
  defaultCaption?: string;
  initialPlatform?: PublishingPlatformKey;
  initialMode?: 'single' | 'multi';
}

export const PublishStudioModal: React.FC<PublishStudioModalProps> = ({
  isOpen,
  onClose,
  defaultVideoPath,
  defaultThumbnailPath,
  defaultTitle = '',
  defaultCaption = '',
  initialPlatform,
  initialMode,
}) => {
  // Video selection
  const [availableVideos, setAvailableVideos] = useState<VideoAssetForPublishing[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoAssetForPublishing | null>(null);
  const [loadingVideos, setLoadingVideos] = useState<boolean>(true);

  // Publishing Mode: 'single' (individual platform) or 'multi' (group publishing)
  const [mode, setMode] = useState<'single' | 'multi'>(
    initialMode || (initialPlatform ? 'single' : 'multi')
  );

  // Platform selection
  const [selectedPlatforms, setSelectedPlatforms] = useState<PublishingPlatformKey[]>(
    initialPlatform ? [initialPlatform] : ['instagram', 'youtube', 'threads']
  );
  const [connections, setConnections] = useState<Record<PublishingPlatformKey, SafeOAuthConnection | null>>({
    youtube: null,
    instagram: null,
    facebook: null,
    threads: null,
  });
  const [loadingConnections, setLoadingConnections] = useState<boolean>(true);

  // Content & Overrides
  const [caption, setCaption] = useState<string>(defaultCaption);
  const [title, setTitle] = useState<string>(defaultTitle);
  const [showOtherSocials, setShowOtherSocials] = useState<boolean>(true);
  const [youtubePrivacy, setYoutubePrivacy] = useState<'public' | 'unlisted' | 'private'>('public');
  const [activeOverridesTab, setActiveOverridesTab] = useState<PublishingPlatformKey | null>(null);

  // Publishing State
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [activeJob, setActiveJob] = useState<SocialPublishingJob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Credentials configuration modal
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configModalPlatform, setConfigModalPlatform] = useState<PublishingPlatformKey>('instagram');

  const getPlatformLabel = (p?: PublishingPlatformKey) => {
    switch (p) {
      case 'youtube':
        return 'YouTube Shorts';
      case 'instagram':
        return 'Instagram Reels';
      case 'facebook':
        return 'Facebook Reels';
      case 'threads':
        return 'Threads';
      default:
        return 'Social Media';
    }
  };

  const handleConnectPlatform = async (p: PublishingPlatformKey) => {
    try {
      const res = await fetch(`/api/social-publishing/oauth/${p}/connect?returnTo=/social-post`, {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else if (data.requiresCredentials) {
        setConfigModalPlatform(p);
        setIsConfigModalOpen(true);
      } else {
        setErrorMessage(data.error || 'Failed to start authorization');
      }
    } catch {
      setConfigModalPlatform(p);
      setIsConfigModalOpen(true);
    }
  };

  // Sync initial props whenever modal opens or props change
  useEffect(() => {
    if (isOpen) {
      if (defaultCaption) setCaption(defaultCaption);
      if (defaultTitle) setTitle(defaultTitle);
      if (initialMode) {
        setMode(initialMode);
      } else if (initialPlatform) {
        setMode('single');
      }
      if (initialPlatform) {
        setSelectedPlatforms([initialPlatform]);
      } else if (initialMode === 'multi') {
        setSelectedPlatforms(['instagram', 'youtube', 'facebook', 'threads']);
      }
    }
  }, [isOpen, defaultCaption, defaultTitle, initialPlatform, initialMode]);

  // Fetch available videos and OAuth connections
  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      setLoadingVideos(true);
      setLoadingConnections(true);
      try {
        const [videosRes, connsRes] = await Promise.all([
          fetch('/api/social-publishing/videos'),
          fetch('/api/social-publishing/oauth/connections'),
        ]);

        const videosData = await videosRes.json();
        const connsData = await connsRes.json();

        if (videosData.success && videosData.videos?.length > 0) {
          setAvailableVideos(videosData.videos);
          // Auto-select matched default or newest video
          const matched = defaultVideoPath
            ? videosData.videos.find((v: VideoAssetForPublishing) => v.storagePath === defaultVideoPath)
            : videosData.videos[0];
          setSelectedVideo(matched || videosData.videos[0]);
        } else if (defaultVideoPath) {
          setSelectedVideo({
            id: 'current_reel',
            title: defaultTitle || 'Current Reel',
            storagePath: defaultVideoPath,
            webUrl: `/api/files/${defaultVideoPath.replace(/^\/+/, '')}`,
            thumbnailUrl: defaultThumbnailPath ? `/api/files/${defaultThumbnailPath.replace(/^\/+/, '')}` : undefined,
            durationSeconds: 45,
            width: 1080,
            height: 1920,
            aspectRatio: '9:16',
            fileSizeBytes: 15000000,
            createdAt: new Date().toISOString(),
          });
        }

        if (connsData.success && connsData.connections) {
          const map: any = { youtube: null, instagram: null, facebook: null, threads: null };
          for (const c of connsData.connections) {
            map[c.platform] = c;
          }
          setConnections(map);
        }
      } catch (err: any) {
        console.error('Failed to load publishing data:', err);
      } finally {
        setLoadingVideos(false);
        setLoadingConnections(false);
      }
    };

    fetchData();
  }, [isOpen, defaultVideoPath, defaultThumbnailPath, defaultTitle]);

  // Poll live publishing job progress
  useEffect(() => {
    if (!isOpen || !activeJob || ['completed', 'failed', 'partial'].includes(activeJob.status)) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/social-publishing/jobs/${activeJob.id}`);
        const data = await res.json();
        if (data.success && data.job) {
          setActiveJob(data.job);
          if (data.job.status === 'completed' || data.job.status === 'failed' || data.job.status === 'partial') {
            setIsPublishing(false);
          }
        }
      } catch (e) {
        console.warn('Job polling error:', e);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeJob, isOpen]);

  if (!isOpen) return null;

  // Platform selection toggles
  const togglePlatform = (p: PublishingPlatformKey) => {
    if (selectedPlatforms.includes(p)) {
      setSelectedPlatforms(selectedPlatforms.filter((item) => item !== p));
    } else {
      setSelectedPlatforms([...selectedPlatforms, p]);
    }
  };

  const selectAll = () => {
    setSelectedPlatforms(['instagram', 'facebook', 'youtube', 'threads']);
  };

  const deselectAll = () => {
    setSelectedPlatforms([]);
  };

  // Submit Publishing
  const handlePublishNow = async () => {
    if (!selectedVideo) {
      setErrorMessage('Please select a video file to publish.');
      return;
    }
    if (selectedPlatforms.length === 0) {
      setErrorMessage('Please select at least one platform.');
      return;
    }
    if (!caption.trim()) {
      setErrorMessage('Post caption cannot be empty.');
      return;
    }

    setIsPublishing(true);
    setErrorMessage(null);

    const platformOverrides: PlatformPublishContentPayload = {};
    if (selectedPlatforms.includes('youtube')) {
      platformOverrides.youtube = {
        title: title || 'Reel #Shorts',
        description: caption,
        privacyStatus: youtubePrivacy,
        madeForKids: false,
      };
    }

    try {
      const res = await fetch('/api/social-publishing/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath: selectedVideo.storagePath,
          thumbnailPath: selectedVideo.thumbnailUrl?.replace('/api/files/', ''),
          videoMetadata: {
            durationSeconds: selectedVideo.durationSeconds,
            width: selectedVideo.width,
            height: selectedVideo.height,
            fileSizeBytes: selectedVideo.fileSizeBytes,
            title: selectedVideo.title,
          },
          selectedPlatforms,
          defaultCaption: caption,
          defaultTitle: title,
          showOtherSocialProfiles: showOtherSocials,
          platformOverrides,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to initiate publishing');
      }

      setActiveJob(data.job);
    } catch (err: any) {
      setErrorMessage(err.message || 'Publishing failed. Please try again.');
      setIsPublishing(false);
    }
  };

  // Retry single platform
  const handleRetryPlatform = async (recordId: string) => {
    if (!activeJob) return;
    try {
      await fetch(`/api/social-publishing/jobs/${activeJob.id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId }),
      });
      // Refresh status immediately
      const res = await fetch(`/api/social-publishing/jobs/${activeJob.id}`);
      const data = await res.json();
      if (data.success && data.job) {
        setActiveJob(data.job);
        setIsPublishing(true);
      }
    } catch (e: any) {
      console.error('Failed to retry:', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400 flex items-center justify-center text-zinc-950 font-black shadow-md shadow-amber-400/20">
              <Upload className="w-5 h-5 text-zinc-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  {mode === 'single' && selectedPlatforms.length === 1
                    ? `Publish to ${getPlatformLabel(selectedPlatforms[0])}`
                    : 'Multi-Platform Social Publishing Studio'}
                </h2>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold border ${
                    mode === 'single'
                      ? 'bg-amber-400/10 text-amber-400 border-amber-400/30'
                      : 'bg-blue-400/10 text-blue-400 border-blue-400/30'
                  }`}
                >
                  {mode === 'single' ? 'Individual Post Mode' : 'Group Post Mode'}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {mode === 'single' && selectedPlatforms.length === 1
                  ? `Publish your customized reel copy directly to ${getPlatformLabel(selectedPlatforms[0])}`
                  : 'Publish directly to Instagram Reels, Facebook Reels, YouTube Shorts & Threads simultaneously'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 custom-scrollbar">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-xs text-rose-300">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. Video Selection & Metadata Preview */}
          <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5 uppercase tracking-wider">
                <Video className="w-4 h-4 text-amber-400" />
                <span>1. Select Exported Video</span>
              </span>
              {availableVideos.length > 1 && (
                <span className="text-[11px] text-zinc-500">
                  {availableVideos.length} rendered videos found
                </span>
              )}
            </div>

            {loadingVideos ? (
              <div className="py-6 flex items-center justify-center text-xs text-zinc-400 gap-2">
                <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                <span>Loading rendered videos...</span>
              </div>
            ) : availableVideos.length > 0 ? (
              <div className="space-y-3">
                {/* Video Selector Dropdown */}
                <div className="relative">
                  <select
                    value={selectedVideo?.id || ''}
                    onChange={(e) => {
                      const v = availableVideos.find((item) => item.id === e.target.value);
                      if (v) setSelectedVideo(v);
                    }}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 font-medium focus:border-amber-400 focus:outline-none appearance-none cursor-pointer"
                  >
                    {availableVideos.map((v) => (
                      <option key={v.id} value={v.id}>
                        🎬 {v.title} ({v.aspectRatio} · {Math.round(v.durationSeconds)}s · {(v.fileSizeBytes / (1024 * 1024)).toFixed(1)}MB)
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-zinc-400 pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2" />
                </div>

                {/* Selected Video Specifications Strip */}
                {selectedVideo && (
                  <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-zinc-300 font-semibold">{selectedVideo.title}</span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[11px] text-zinc-400">
                      <span>Aspect: <strong className="text-zinc-200">{selectedVideo.aspectRatio}</strong></span>
                      <span className="text-zinc-600">·</span>
                      <span>Duration: <strong className="text-zinc-200">{Math.round(selectedVideo.durationSeconds)}s</strong></span>
                      <span className="text-zinc-600">·</span>
                      <span>Size: <strong className="text-zinc-200">{(selectedVideo.fileSizeBytes / (1024 * 1024)).toFixed(1)}MB</strong></span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-zinc-950 rounded-xl border border-dashed border-zinc-800 text-center space-y-1">
                <p className="text-xs text-zinc-300 font-semibold">No previously rendered reels found</p>
                <p className="text-[11px] text-zinc-500">Render a video first in Reel Maker to publish directly.</p>
              </div>
            )}
          </div>

          {/* 2. Platform Selection Cards */}
          <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5 uppercase tracking-wider">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>2. Target Platforms</span>
                </span>
                <span className="text-[11px] text-zinc-400 font-normal">
                  {mode === 'single'
                    ? '(Posting individually to selected platform)'
                    : '(Publishing together to multiple platforms)'}
                </span>
              </div>

              {/* Mode Switcher */}
              <div className="flex items-center gap-2.5">
                <div className="flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('single');
                      if (selectedPlatforms.length !== 1) {
                        setSelectedPlatforms([selectedPlatforms[0] || initialPlatform || 'instagram']);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                      mode === 'single'
                        ? 'bg-amber-400 text-zinc-950 shadow-sm font-bold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Individual Post
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('multi');
                      if (selectedPlatforms.length <= 1) {
                        setSelectedPlatforms(['instagram', 'youtube', 'facebook', 'threads']);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                      mode === 'multi'
                        ? 'bg-amber-400 text-zinc-950 shadow-sm font-bold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Group Post (Multi)
                  </button>
                </div>

                {mode === 'multi' && (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-amber-400 hover:text-amber-300 font-semibold transition-colors cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-zinc-600">|</span>
                    <button
                      type="button"
                      onClick={deselectAll}
                      className="text-zinc-400 hover:text-zinc-300 transition-colors cursor-pointer"
                    >
                      Deselect All
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {(['instagram', 'youtube', 'facebook', 'threads'] as PublishingPlatformKey[]).map((p) => {
                const conn = connections[p];
                const isSelected = selectedPlatforms.includes(p);
                const isConnected = Boolean(conn && conn.status === 'connected');

                return (
                  <div
                    key={p}
                    onClick={() => {
                      if (!isConnected) return;
                      if (mode === 'single') {
                        setSelectedPlatforms([p]);
                      } else {
                        togglePlatform(p);
                      }
                    }}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                      !isConnected
                        ? 'bg-zinc-950/40 border-zinc-800/80 opacity-75'
                        : isSelected
                        ? 'bg-amber-400/10 border-amber-400/60 shadow-md shadow-amber-400/5 cursor-pointer ring-1 ring-amber-400/30'
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <SocialPlatformIcon platform={p} size="sm" />
                        <div>
                          <div className="text-xs font-bold text-zinc-100 capitalize">
                            {getPlatformLabel(p)}
                          </div>
                          <div className="text-[10px] text-zinc-400 truncate max-w-[130px]">
                            {conn?.accountHandle || conn?.accountName || 'Not connected'}
                          </div>
                        </div>
                      </div>

                      {/* Checkbox or Radio selection */}
                      {isConnected ? (
                        mode === 'single' ? (
                          <div
                            className={`w-4 h-4 rounded-full flex items-center justify-center transition-all ${
                              isSelected
                                ? 'bg-amber-400 text-zinc-950 ring-2 ring-amber-400/30'
                                : 'border border-zinc-700'
                            }`}
                          >
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-zinc-950" />}
                          </div>
                        ) : (
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                              isSelected ? 'bg-amber-400 text-zinc-950' : 'border border-zinc-700'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        )
                      ) : null}
                    </div>

                    {!isConnected ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConnectPlatform(p);
                        }}
                        className="mt-2 text-center text-[10px] font-bold text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 rounded-lg py-1 px-2 transition-all block cursor-pointer"
                      >
                        Connect Account
                      </button>
                    ) : (
                      <div className="mt-1 flex items-center justify-between text-[10px]">
                        <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Connected</span>
                        </span>
                        {mode === 'single' && isSelected && (
                          <span className="text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 rounded">
                            Target
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Post Content & Smart Social Profile Links */}
          <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5 uppercase tracking-wider">
                <Captions className="w-4 h-4 text-amber-400" />
                <span>3. Post Caption & Metadata</span>
              </span>

              {/* YouTube Title Input Toggle */}
              {selectedPlatforms.includes('youtube') && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-400">YouTube Privacy:</span>
                  <select
                    value={youtubePrivacy}
                    onChange={(e) => setYoutubePrivacy(e.target.value as any)}
                    className="bg-zinc-950 border border-zinc-700 rounded-lg text-[11px] text-zinc-300 px-2 py-1 focus:outline-none focus:border-amber-400"
                  >
                    <option value="public">Public</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="private">Private</option>
                  </select>
                </div>
              )}
            </div>

            {/* Title field if YouTube Shorts is selected */}
            {selectedPlatforms.includes('youtube') && (
              <div>
                <label className="text-[11px] text-zinc-400 font-semibold mb-1 block">
                  YouTube Shorts Title (1-100 characters):
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                  placeholder="Catchy Shorts title #Shorts"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-400 font-sans"
                />
              </div>
            )}

            {/* Caption Textarea */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-zinc-400 font-semibold">
                  Post Description (Shared baseline):
                </label>
                <span className="text-[11px] font-mono text-zinc-500">
                  {caption.length} characters
                </span>
              </div>
              <textarea
                rows={5}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write your social post description..."
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-400 font-sans leading-relaxed resize-none shadow-inner"
              />
            </div>

            {/* Show Other Social Profiles Toggle (Step 5) */}
            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-zinc-200">
                    Show Other Social Profiles
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Automatically appends your connected profile links to post descriptions while cleanly excluding each platform&apos;s own link.
                  </div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={showOtherSocials}
                  onChange={(e) => setShowOtherSocials(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-400"></div>
              </label>
            </div>
          </div>

          {/* 4. Live Publishing Progress & Job Status */}
          {activeJob && (
            <div className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-700/80 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  <RotateCw className={`w-4 h-4 text-amber-400 ${activeJob.status === 'in_progress' ? 'animate-spin' : ''}`} />
                  <span>Publishing Progress</span>
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                  activeJob.status === 'completed'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : activeJob.status === 'failed'
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                }`}>
                  {activeJob.status.replace('_', ' ')}
                </span>
              </div>

              {/* Individual Platform Progress Rows */}
              <div className="space-y-2">
                {activeJob.platforms.map((record) => (
                  <div
                    key={record.id}
                    className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <SocialPlatformIcon platform={record.platform} size="sm" />
                      <div>
                        <div className="font-bold text-zinc-200 capitalize">
                          {record.platform}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {record.status === 'uploading' && `Uploading (${record.progressPercent}%)...`}
                          {record.status === 'processing' && 'Processing video on platform server...'}
                          {record.status === 'published' && 'Published successfully!'}
                          {record.status === 'failed' && (record.errorMessage || 'Publishing failed')}
                          {record.status === 'pending' && 'Queued for upload...'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {record.status === 'published' && record.platformPostUrl && (
                        <a
                          href={record.platformPostUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold transition-colors"
                        >
                          <span>Open Post</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {record.status === 'failed' && (
                        <button
                          type="button"
                          onClick={() => handleRetryPlatform(record.id)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 border border-amber-400/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <RotateCw className="w-3 h-3" />
                          <span>Retry</span>
                        </button>
                      )}
                      {(record.status === 'uploading' || record.status === 'processing') && (
                        <ProgressCircle value={record.progressPercent} size={28} strokeWidth={3} label={`${record.platform} publishing progress`} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/80 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            {activeJob?.status === 'completed' ? 'Done' : 'Cancel'}
          </button>

          <button
            type="button"
            onClick={handlePublishNow}
            disabled={isPublishing || selectedPlatforms.length === 0 || !selectedVideo}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-zinc-950 font-black rounded-xl text-xs transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-amber-400/20 active:scale-95"
          >
            {isPublishing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
                <span>Publishing Now...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 text-zinc-950" />
                <span>
                  {mode === 'single' && selectedPlatforms.length === 1
                    ? `Publish to ${getPlatformLabel(selectedPlatforms[0])} Now`
                    : `Publish Now (${selectedPlatforms.length} Platforms)`}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Developer API Keys Configuration Modal */}
      <OAuthCredentialsModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        initialPlatform={configModalPlatform}
        onSaved={async () => {
          // Re-fetch connections after saving keys
          try {
            const connsRes = await fetch('/api/social-publishing/oauth/connections');
            const connsData = await connsRes.json();
            if (connsData.success && connsData.connections) {
              const map: any = { youtube: null, instagram: null, facebook: null, threads: null };
              for (const c of connsData.connections) {
                map[c.platform] = c;
              }
              setConnections(map);
            }
          } catch {}
        }}
      />
    </div>
  );
};
