'use strict';
'use client';

import React from 'react';
import {
  CaptionStyle,
  CaptionMode,
  AnimationPreset,
  HighlightAnimation,
  CaptionPosition,
  FontWeight,
  TextAlignment,
} from '@/lib/caption-maker/types';
import {
  Type,
  Palette,
  Sparkles,
  Layout,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ShieldAlert,
} from 'lucide-react';

interface CaptionStylePanelProps {
  style: CaptionStyle;
  onChangeStyle: (newStyle: CaptionStyle) => void;
}

const FONTS = [
  { label: 'Inter (Modern Sans)', value: 'Inter, sans-serif' },
  { label: 'Montserrat (Bold & Clean)', value: 'Montserrat, sans-serif' },
  { label: 'Impact (Viral Reel Bold)', value: 'Impact, sans-serif' },
  { label: 'Outfit (Trendy Tech)', value: 'Outfit, sans-serif' },
  { label: 'Arial Black (Heavy Punch)', value: '"Arial Black", sans-serif' },
  { label: 'Trebuchet MS (Friendly)', value: '"Trebuchet MS", sans-serif' },
];

export const CaptionStylePanel: React.FC<CaptionStylePanelProps> = ({
  style,
  onChangeStyle,
}) => {
  const update = (partial: Partial<CaptionStyle>) => {
    onChangeStyle({ ...style, ...partial });
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
      {/* Header */}
      <div className="p-3.5 bg-zinc-950/70 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-amber-400" />
          <h3 className="font-semibold text-zinc-100 text-sm tracking-wide">
            Caption Styles & Effects
          </h3>
        </div>
        <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 capitalize">
          {style.captionMode.replace('-', ' ')}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar text-xs">
        {/* Caption Mode Selector */}
        <div>
          <label className="block text-zinc-300 font-medium mb-1.5 flex items-center gap-1.5">
            <Layout className="w-3.5 h-3.5 text-amber-400" />
            Caption Display Mode
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: 'phrase-highlight', label: 'Phrase Highlight', desc: 'Full phrase with active word glow' },
                { id: 'word-by-word', label: 'Word by Word', desc: 'Single word popup on beat' },
                { id: 'kinetic', label: 'Kinetic', desc: 'Dynamic energetic motion' },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => update({ captionMode: mode.id as CaptionMode })}
                className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-all ${
                  style.captionMode === mode.id
                    ? 'bg-amber-500/15 border-amber-500/60 text-white ring-1 ring-amber-500/30'
                    : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <span className="font-semibold text-[11px] block">{mode.label}</span>
                <span className="text-[10px] text-zinc-500 mt-1 line-clamp-1">{mode.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Animation Preset & Highlight Animation */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-zinc-300 font-medium mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Animation Preset
            </label>
            <select
              value={style.animationPreset}
              onChange={(e) =>
                update({ animationPreset: e.target.value as AnimationPreset })
              }
              className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg p-2 focus:border-amber-400 focus:outline-none"
            >
              <option value="clean">Clean (Fade)</option>
              <option value="pop">Pop (Scale on Beat)</option>
              <option value="punch">Punch (Heavy Accent)</option>
              <option value="kinetic">Kinetic (Dynamic Float)</option>
              <option value="minimal">Minimal (Static)</option>
            </select>
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1.5">
              Word Highlight Effect
            </label>
            <select
              value={style.highlightAnimation}
              onChange={(e) =>
                update({
                  highlightAnimation: e.target.value as HighlightAnimation,
                })
              }
              className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg p-2 focus:border-amber-400 focus:outline-none"
            >
              <option value="pop">Pop & Grow</option>
              <option value="glow">Glow Highlight</option>
              <option value="color-change">Color Accent Only</option>
              <option value="background">Pill Background</option>
              <option value="underline">Underline</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>

        {/* Font Family & Weight */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-zinc-300 font-medium mb-1.5 flex items-center gap-1">
              <Type className="w-3.5 h-3.5 text-amber-400" />
              Font Family
            </label>
            <select
              value={style.fontFamily}
              onChange={(e) => update({ fontFamily: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg p-2 focus:border-amber-400 focus:outline-none"
            >
              {FONTS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1.5">Font Weight</label>
            <select
              value={style.fontWeight}
              onChange={(e) =>
                update({ fontWeight: e.target.value as FontWeight })
              }
              className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg p-2 focus:border-amber-400 focus:outline-none"
            >
              <option value="normal">Regular (400)</option>
              <option value="medium">Medium (500)</option>
              <option value="semibold">Semibold (600)</option>
              <option value="bold">Bold (700)</option>
              <option value="black">Black Heavy (900)</option>
            </select>
          </div>
        </div>

        {/* Font Size Slider */}
        <div>
          <div className="flex justify-between items-center mb-1 text-zinc-300">
            <label className="font-medium">Font Size</label>
            <span className="font-mono text-amber-400">{style.fontSize}px</span>
          </div>
          <input
            type="range"
            min="32"
            max="110"
            step="2"
            value={style.fontSize}
            onChange={(e) => update({ fontSize: Number(e.target.value) })}
            className="w-full accent-amber-400 cursor-pointer"
          />
        </div>

        {/* Colors (Normal & Important Word) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-2.5 bg-zinc-950/80 border border-zinc-800 rounded-lg">
            <label className="block text-zinc-400 font-medium mb-1.5">
              Normal Text Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={style.textColor}
                onChange={(e) => update({ textColor: e.target.value })}
                className="w-7 h-7 rounded border-0 cursor-pointer bg-transparent"
              />
              <span className="font-mono text-zinc-300 uppercase">
                {style.textColor}
              </span>
            </div>
          </div>

          <div className="p-2.5 bg-zinc-950/80 border border-zinc-800 rounded-lg">
            <label className="block text-amber-400 font-medium mb-1.5">
              Important / Accent Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={style.importantColor}
                onChange={(e) => update({ importantColor: e.target.value })}
                className="w-7 h-7 rounded border-0 cursor-pointer bg-transparent"
              />
              <span className="font-mono text-amber-300 uppercase">
                {style.importantColor}
              </span>
            </div>
          </div>
        </div>

        {/* Stroke / Outline Width */}
        <div>
          <div className="flex justify-between items-center mb-1 text-zinc-300">
            <label className="font-medium">Text Stroke / Outline</label>
            <span className="font-mono text-zinc-400">{style.strokeWidth}px</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={style.strokeWidth}
              onChange={(e) => update({ strokeWidth: Number(e.target.value) })}
              className="w-full accent-amber-400 cursor-pointer"
            />
            <input
              type="color"
              value={style.strokeColor}
              onChange={(e) => update({ strokeColor: e.target.value })}
              className="w-7 h-7 rounded border-0 cursor-pointer bg-transparent shrink-0"
              title="Stroke color"
            />
          </div>
        </div>

        {/* Text Alignment & Uppercase */}
        <div className="grid grid-cols-2 gap-3 items-center">
          <div>
            <label className="block text-zinc-300 font-medium mb-1.5">Alignment</label>
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
              {(
                [
                  { id: 'left', icon: AlignLeft },
                  { id: 'center', icon: AlignCenter },
                  { id: 'right', icon: AlignRight },
                ] as const
              ).map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => update({ textAlign: id as TextAlignment })}
                  className={`flex-1 py-1 flex items-center justify-center rounded transition-colors ${
                    style.textAlign === id
                      ? 'bg-amber-500 text-black font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1.5">Transform</label>
            <label className="flex items-center gap-2 cursor-pointer bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-300 hover:border-zinc-700">
              <input
                type="checkbox"
                checked={style.uppercase}
                onChange={(e) => update({ uppercase: e.target.checked })}
                className="accent-amber-400 rounded"
              />
              <span className="font-semibold text-[11px]">ALL CAPS (UPPERCASE)</span>
            </label>
          </div>
        </div>

        {/* Position (Top, Center, Bottom, Custom) */}
        <div>
          <label className="block text-zinc-300 font-medium mb-1.5">Vertical Position</label>
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                { id: 'top', label: 'Top' },
                { id: 'center', label: 'Center' },
                { id: 'bottom', label: 'Bottom' },
                { id: 'custom', label: 'Custom' },
              ] as const
            ).map((pos) => (
              <button
                key={pos.id}
                type="button"
                onClick={() => update({ position: pos.id as CaptionPosition })}
                className={`py-1.5 rounded-lg border text-center font-medium transition-all ${
                  style.position === pos.id
                    ? 'bg-amber-500 text-black border-amber-400 font-semibold'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {pos.label}
              </button>
            ))}
          </div>

          {style.position === 'custom' && (
            <div className="mt-2.5 p-2.5 bg-zinc-950 rounded-lg border border-zinc-800 space-y-2">
              <div className="flex justify-between items-center text-zinc-400 text-[11px]">
                <span>Vertical Position (Y%)</span>
                <span className="font-mono text-amber-400">{style.customY ?? 75}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                step="1"
                value={style.customY ?? 75}
                onChange={(e) => update({ customY: Number(e.target.value) })}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* Safe Area Guide Toggle */}
        <div className="p-3 bg-zinc-950/90 border border-zinc-800/80 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <div>
              <p className="font-medium text-zinc-200 text-xs">Safe Area Overlay</p>
              <p className="text-[10px] text-zinc-500">
                Highlights 9:16 Instagram/TikTok button & caption dead zones
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={style.showSafeArea}
            onChange={(e) => update({ showSafeArea: e.target.checked })}
            className="w-4 h-4 accent-amber-400 rounded cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
