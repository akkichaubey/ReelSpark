'use strict';
'use client';

import React from 'react';
import {
  OutputSettings,
  PlatformPreset,
  ResolutionTier,
  VideoFps,
  VideoQuality,
} from '@/lib/caption-maker/types';
import { PLATFORM_PRESETS } from '@/lib/caption-maker/sample-data';
import {
  RESOLUTION_DIMENSIONS,
  SUPPORTED_FRAME_RATES,
  QUALITY_PROFILES,
  getDimensionsForAspectAndTier,
  detectResolutionTier,
  estimateExportFileSize,
} from '@/lib/caption-maker/export-settings';
import {
  Smartphone,
  Tv,
  Settings2,
  Film,
  Layers,
  Sparkles,
  Gauge,
  Sliders,
  HardDrive,
} from 'lucide-react';

const InstagramIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const YoutubeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
    <polygon points="10 15 15 12 10 9 10 15" fill="currentColor" />
  </svg>
);

interface OutputSettingsPanelProps {
  settings: OutputSettings;
  onChangeSettings: (settings: OutputSettings) => void;
  audioDuration?: number;
}

export const OutputSettingsPanel: React.FC<OutputSettingsPanelProps> = ({
  settings,
  onChangeSettings,
  audioDuration = 15,
}) => {
  const currentTier: ResolutionTier =
    settings.resolution || detectResolutionTier(settings.width, settings.height);

  const handleSelectPreset = (presetKey: PlatformPreset) => {
    const p = PLATFORM_PRESETS[presetKey];
    const aspect = p.aspectRatio;
    const dims = getDimensionsForAspectAndTier(aspect, currentTier);

    onChangeSettings({
      ...settings,
      preset: presetKey,
      aspectRatio: aspect,
      width: dims.width,
      height: dims.height,
      resolution: currentTier,
    });
  };

  const handleSelectTier = (tier: ResolutionTier) => {
    const aspect = settings.aspectRatio || '9:16';
    const dims = getDimensionsForAspectAndTier(aspect, tier);

    onChangeSettings({
      ...settings,
      resolution: tier,
      width: dims.width,
      height: dims.height,
    });
  };

  const handleSelectFps = (fps: VideoFps) => {
    onChangeSettings({
      ...settings,
      fps,
    });
  };

  const handleSelectQuality = (quality: VideoQuality) => {
    const profile = QUALITY_PROFILES[quality];
    onChangeSettings({
      ...settings,
      quality,
      bitrate: profile.targetBitrate,
      audioBitrate: profile.audioBitrate,
    });
  };

  const handleCustomDimension = (field: 'width' | 'height', val: number) => {
    const newWidth = field === 'width' ? Math.max(360, Math.min(3840, val)) : settings.width;
    const newHeight = field === 'height' ? Math.max(360, Math.min(3840, val)) : settings.height;
    const detectedTier = detectResolutionTier(newWidth, newHeight);

    onChangeSettings({
      ...settings,
      preset: 'custom',
      width: newWidth,
      height: newHeight,
      aspectRatio: 'custom',
      resolution: detectedTier,
    });
  };

  const presetList: {
    key: PlatformPreset;
    title: string;
    sub: string;
    ratio: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      key: 'instagram-reel',
      title: 'Instagram Reel',
      sub: '9:16 Vertical',
      ratio: '9:16',
      icon: InstagramIcon,
    },
    {
      key: 'youtube-short',
      title: 'YouTube Short',
      sub: '9:16 Vertical',
      ratio: '9:16',
      icon: YoutubeIcon,
    },
    {
      key: 'instagram-portrait',
      title: 'Instagram Portrait',
      sub: '4:5 Feed Post',
      ratio: '4:5',
      icon: Smartphone,
    },
    {
      key: 'instagram-square',
      title: 'Square Feed',
      sub: '1:1 Square',
      ratio: '1:1',
      icon: Layers,
    },
    {
      key: 'youtube-landscape',
      title: 'YouTube Landscape',
      sub: '16:9 Cinema',
      ratio: '16:9',
      icon: Tv,
    },
  ];

  const estimatedSize = estimateExportFileSize(
    audioDuration,
    settings.quality,
    currentTier,
    settings.fps
  );

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
      {/* Header */}
      <div className="p-3.5 bg-zinc-950/70 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-amber-400" />
          <h3 className="font-semibold text-zinc-100 text-sm tracking-wide">
            Studio Output & Quality
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-mono font-bold">
            {currentTier.toUpperCase()} @ {settings.fps} FPS
          </span>
          <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded font-mono text-zinc-300">
            {settings.width} × {settings.height}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar text-xs">
        {/* Real-time Estimated Export Size Card */}
        <div className="p-3 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <HardDrive className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="text-zinc-200 font-semibold text-xs flex items-center gap-1.5">
                <span>Estimated Export Size</span>
                <span className="text-[10px] text-zinc-500 font-normal">
                  ({audioDuration.toFixed(1)}s clip)
                </span>
              </div>
              <div className="text-[11px] text-zinc-400">
                {settings.quality.toUpperCase()} • {currentTier.toUpperCase()} • {settings.fps} FPS
              </div>
            </div>
          </div>
          <span className="font-mono text-sm font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/25">
            {estimatedSize}
          </span>
        </div>

        {/* Target Platform Preset Grid */}
        <div>
          <label className="block text-zinc-300 font-medium mb-2">
            Target Platform Preset
          </label>
          <div className="grid grid-cols-2 gap-2">
            {presetList.map((preset) => {
              const Icon = preset.icon;
              const isSelected = settings.preset === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => handleSelectPreset(preset.key)}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-500/80 text-white ring-1 ring-amber-500/30 shadow-md'
                      : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Icon
                      className={`w-4 h-4 ${
                        isSelected ? 'text-amber-400' : 'text-zinc-500'
                      }`}
                    />
                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                        isSelected
                          ? 'bg-amber-500 text-black font-bold'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {preset.ratio}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-xs block text-zinc-100">
                      {preset.title}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {preset.sub}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Resolution Tier Selector (720p / 1080p / 1440p / 4K) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-zinc-300 font-medium flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Resolution Tier</span>
            </label>
            <span className="text-[10px] font-mono text-zinc-400">
              Auto-scales canvas for {settings.aspectRatio}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {(
              [
                { tier: '720p', label: '720p HD', badge: 'Light' },
                { tier: '1080p', label: '1080p FHD', badge: 'Default' },
                { tier: '1440p', label: '2K QHD', badge: 'Crisp' },
                { tier: '4k', label: '4K UHD', badge: 'Ultra' },
              ] as const
            ).map((item) => {
              const isSelected = currentTier === item.tier;
              const dims = getDimensionsForAspectAndTier(settings.aspectRatio, item.tier);
              return (
                <button
                  key={item.tier}
                  type="button"
                  onClick={() => handleSelectTier(item.tier)}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-500 text-white font-bold ring-1 ring-amber-500/30'
                      : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <div className="font-semibold text-xs">{item.label}</div>
                  <div className="text-[9px] text-zinc-500 font-mono mt-0.5">
                    {dims.width}×{dims.height}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Frame Rate (FPS) Selector (24, 25, 30, 60) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-zinc-300 font-medium flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-amber-400" />
              <span>Frame Rate (FPS)</span>
            </label>
            <span className="text-[10px] text-zinc-500 font-mono">
              Render temporal rate
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {SUPPORTED_FRAME_RATES.map((rate) => {
              const isSelected = settings.fps === rate.fps;
              return (
                <button
                  key={rate.fps}
                  type="button"
                  onClick={() => handleSelectFps(rate.fps)}
                  className={`py-2 px-1 rounded-xl border text-center font-mono transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500 text-black border-amber-400 font-bold shadow-md'
                      : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                  }`}
                  title={rate.description}
                >
                  <div className="text-xs font-bold">{rate.fps} FPS</div>
                  <div
                    className={`text-[9px] truncate ${
                      isSelected ? 'text-black/80' : 'text-zinc-500'
                    }`}
                  >
                    {rate.fps === 24
                      ? 'Cinema'
                      : rate.fps === 25
                      ? 'PAL'
                      : rate.fps === 30
                      ? 'Default'
                      : 'Smooth'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quality Tiers (Draft, Standard, High, Pro) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-zinc-300 font-medium flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Encoding Quality & Bitrate</span>
            </label>
            <span className="text-[10px] text-zinc-500 font-mono">
              Target CRF & Preset
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(
              [
                QUALITY_PROFILES.draft,
                QUALITY_PROFILES.standard,
                QUALITY_PROFILES.high,
                QUALITY_PROFILES.pro,
              ] as const
            ).map((q) => {
              const isSelected = settings.quality === q.id;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => handleSelectQuality(q.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-500 text-white font-semibold ring-1 ring-amber-500/30'
                      : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs text-zinc-100">{q.label}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                        isSelected
                          ? 'bg-amber-500 text-black'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      CRF {q.crf}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-400 leading-tight mb-1">
                    {q.desc}
                  </div>
                  <div className="text-[9px] text-zinc-500 font-mono">
                    ~{q.targetBitrate} v-bitrate • {q.audioBitrate} aac
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Resolution Option */}
        <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-zinc-200 flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5 text-zinc-400" />
              Custom Resolution Override
            </span>
            {settings.preset === 'custom' && (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono font-bold border border-amber-500/30">
                Custom Active
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">
                Width (px)
              </label>
              <input
                type="number"
                min="360"
                max="3840"
                step="2"
                value={settings.width}
                onChange={(e) =>
                  handleCustomDimension('width', parseInt(e.target.value) || 1080)
                }
                className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg p-2 font-mono text-xs focus:border-amber-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">
                Height (px)
              </label>
              <input
                type="number"
                min="360"
                max="3840"
                step="2"
                value={settings.height}
                onChange={(e) =>
                  handleCustomDimension('height', parseInt(e.target.value) || 1920)
                }
                className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg p-2 font-mono text-xs focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
