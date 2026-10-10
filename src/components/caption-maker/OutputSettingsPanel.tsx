'use strict';
'use client';

import React from 'react';
import { OutputSettings, PlatformPreset } from '@/lib/caption-maker/types';
import { PLATFORM_PRESETS } from '@/lib/caption-maker/sample-data';
import {
  Smartphone,
  Tv,
  Settings2,
  Film,
  Layers,
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
}

export const OutputSettingsPanel: React.FC<OutputSettingsPanelProps> = ({
  settings,
  onChangeSettings,
}) => {
  const handleSelectPreset = (presetKey: PlatformPreset) => {
    const p = PLATFORM_PRESETS[presetKey];
    onChangeSettings({
      ...settings,
      preset: presetKey,
      width: p.width,
      height: p.height,
      aspectRatio: p.aspectRatio,
    });
  };

  const handleCustomDimension = (field: 'width' | 'height', val: number) => {
    onChangeSettings({
      ...settings,
      preset: 'custom',
      [field]: Math.max(360, Math.min(3840, val)),
      aspectRatio: 'custom',
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
      sub: '1080 × 1920',
      ratio: '9:16',
      icon: InstagramIcon,
    },
    {
      key: 'youtube-short',
      title: 'YouTube Short',
      sub: '1080 × 1920',
      ratio: '9:16',
      icon: YoutubeIcon,
    },
    {
      key: 'instagram-portrait',
      title: 'Instagram Portrait',
      sub: '1080 × 1350',
      ratio: '4:5',
      icon: Smartphone,
    },
    {
      key: 'instagram-square',
      title: 'Square Feed',
      sub: '1080 × 1080',
      ratio: '1:1',
      icon: Layers,
    },
    {
      key: 'youtube-landscape',
      title: 'YouTube Video',
      sub: '1920 × 1080',
      ratio: '16:9',
      icon: Tv,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
      {/* Header */}
      <div className="p-3.5 bg-zinc-950/70 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-amber-400" />
          <h3 className="font-semibold text-zinc-100 text-sm tracking-wide">
            Output Platform & Resolution
          </h3>
        </div>
        <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded font-mono text-zinc-300">
          {settings.width} × {settings.height} ({settings.aspectRatio})
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar text-xs">
        {/* Presets Grid */}
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
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
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

        {/* Custom Resolution Option */}
        <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-zinc-200 flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5 text-zinc-400" />
              Custom Resolution
            </span>
            {settings.preset === 'custom' && (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono">
                Active
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

        {/* Quality Settings */}
        <div className="space-y-3">
          <label className="block text-zinc-300 font-medium">Export Quality</label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'draft', label: 'Draft', desc: 'Fast render' },
                { id: 'standard', label: 'Standard', desc: 'Optimal 1080p' },
                { id: 'high', label: 'High', desc: 'Max fidelity' },
              ] as const
            ).map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => onChangeSettings({ ...settings, quality: q.id })}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  settings.quality === q.id
                    ? 'bg-amber-500/15 border-amber-500 text-white font-semibold'
                    : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="font-semibold text-xs">{q.label}</div>
                <div className="text-[10px] text-zinc-500">{q.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* FPS */}
        <div>
          <label className="block text-zinc-300 font-medium mb-1.5">
            Frame Rate (FPS)
          </label>
          <div className="flex gap-2">
            {[30, 60].map((fps) => (
              <button
                key={fps}
                type="button"
                onClick={() => onChangeSettings({ ...settings, fps })}
                className={`flex-1 py-1.5 rounded-lg border font-mono font-medium transition-all ${
                  settings.fps === fps
                    ? 'bg-amber-500 text-black border-amber-400 font-bold'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {fps} FPS
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
