'use strict';
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  ThumbnailSettings,
  THUMBNAIL_PRESETS,
  THUMBNAIL_GRADIENTS,
  QUICK_BADGES,
} from '@/lib/caption-maker/thumbnail-presets';
import { CaptionGroup, ImageAsset } from '@/lib/caption-maker/types';
import {
  POPULAR_GOOGLE_FONTS,
  loadGoogleFontInDocument,
  loadFontBatch,
} from '@/lib/caption-maker/google-fonts';
import {
  Type,
  Palette,
  Wand2,
  Tag,
  Layout,
  Sparkles,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Check,
  Upload,
  Download,
  Image as ImageIcon,
  CheckCircle2,
  SlidersHorizontal,
  ShieldAlert,
} from 'lucide-react';

interface ThumbnailStylePanelProps {
  settings: ThumbnailSettings;
  onChangeSettings: (newSettings: ThumbnailSettings) => void;
  projectTitle?: string;
  captionGroups?: CaptionGroup[];
  image?: ImageAsset;
  onDownload?: (format: 'png' | 'jpeg') => void;
  onApplyAsReelImage?: () => void;
}

export const ThumbnailStylePanel: React.FC<ThumbnailStylePanelProps> = ({
  settings,
  onChangeSettings,
  projectTitle,
  captionGroups = [],
  image,
  onDownload,
  onApplyAsReelImage,
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'content' | 'badge' | 'typography' | 'layout'>('presets');
  const [isFontPickerOpen, setIsFontPickerOpen] = useState<boolean>(false);
  const [fontSearchQuery, setFontSearchQuery] = useState<string>('');
  const [appliedNotice, setAppliedNotice] = useState<boolean>(false);

  // Extract quick suggested titles from project transcript
  const suggestedTitles = useMemo(() => {
    const list: string[] = [];
    if (projectTitle && projectTitle !== 'Untitled Reel') {
      list.push(projectTitle);
    }
    captionGroups.slice(0, 4).forEach((g) => {
      const phrase = g.words.map((w) => w.text).join(' ').trim();
      if (phrase.length > 8 && phrase.length < 50 && !list.includes(phrase)) {
        list.push(phrase);
      }
    });
    if (list.length === 0) {
      list.push('CREATE VIRAL REELS IN SECONDS', 'THE SECRET TO EXPLOSIVE GROWTH', 'STOP MAKING THESE MISTAKES');
    }
    return list;
  }, [projectTitle, captionGroups]);

  // Load font whenever it changes
  useEffect(() => {
    if (settings.fontFamily) {
      loadGoogleFontInDocument(settings.fontFamily);
    }
  }, [settings.fontFamily]);

  const update = (partial: Partial<ThumbnailSettings>) => {
    onChangeSettings({
      ...settings,
      ...partial,
    });
  };

  const applyPreset = (presetId: string) => {
    const found = THUMBNAIL_PRESETS.find((p) => p.id === presetId);
    if (!found) return;

    if (found.settings.fontFamily) {
      loadGoogleFontInDocument(found.settings.fontFamily);
    }

    onChangeSettings({
      ...settings,
      ...found.settings,
      preset: found.id,
      title: settings.title,
      subtitle: settings.subtitle,
      brandingText: settings.brandingText,
      position: settings.position,
      customY: settings.customY,
      aspectRatio: settings.aspectRatio,
      backgroundType: settings.backgroundType,
    });
  };

  // Words list in current title for click-to-highlight chips
  const titleWords = (settings.title || '')
    .split(/\s+/)
    .map((w) => w.trim().replace(/^[*]+|[*]+$/g, ''))
    .filter(Boolean);

  const toggleHighlightWord = (rawWord: string) => {
    const clean = rawWord.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (!clean) return;

    const current = settings.highlightWords || [];
    const isAlready = current.includes(clean);
    const updated = isAlready
      ? current.filter((w) => w !== clean)
      : [...current, clean];

    update({ highlightWords: updated });
  };

  const handleCustomBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        update({
          customBgUrl: dataUrl,
          backgroundType: 'project',
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApplyCover = () => {
    onApplyAsReelImage?.();
    setAppliedNotice(true);
    setTimeout(() => setAppliedNotice(false), 2500);
  };

  const filteredFonts = POPULAR_GOOGLE_FONTS.filter(
    (f) =>
      f.name.toLowerCase().includes(fontSearchQuery.toLowerCase()) ||
      f.badge.toLowerCase().includes(fontSearchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
      {/* Header */}
      <div className="p-3.5 bg-zinc-950/70 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h3 className="font-semibold text-zinc-100 text-sm tracking-wide">
            Thumbnail Style & Cover Hook
          </h3>
        </div>
        <span className="text-[11px] bg-amber-500/10 text-amber-300 border border-amber-500/25 px-2 py-0.5 rounded-full font-medium">
          {settings.aspectRatio} Cover
        </span>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center border-b border-zinc-800 bg-zinc-950/50 p-1 text-[11px]">
        {[
          { id: 'presets', label: 'Presets', icon: Wand2 },
          { id: 'content', label: 'Title', icon: Type },
          { id: 'badge', label: 'Badge', icon: Tag },
          { id: 'typography', label: 'Style', icon: Palette },
          { id: 'layout', label: 'Layout', icon: Layout },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-1.5 px-2 rounded-lg font-medium flex items-center justify-center gap-1 transition-all ${
                isActive
                  ? 'bg-zinc-800 text-amber-300 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-400' : 'text-zinc-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
        {/* SUB-TAB 1: 1-CLICK PRESETS */}
        {activeTab === 'presets' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-200">
                1-Click Viral Thumbnail Templates
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                {THUMBNAIL_PRESETS.length} Presets
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {THUMBNAIL_PRESETS.map((preset) => {
                const isSelected = settings.preset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.id)}
                    className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-400 shadow-md shadow-amber-400/10'
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-100 text-xs">
                          {preset.name}
                        </span>
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-black"
                          style={{
                            backgroundColor: preset.badgePreview.bg,
                            color: preset.badgePreview.color,
                          }}
                        >
                          {preset.badgePreview.text}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 leading-snug">
                        {preset.tagline}
                      </p>
                    </div>

                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center text-black font-bold shrink-0">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* SUB-TAB 2: TITLE & CONTENT */}
        {activeTab === 'content' && (
          <div className="space-y-3.5">
            {/* Title Textarea */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-amber-400" />
                  Thumbnail Title Hook
                </label>
                <span className="text-[10px] text-zinc-500">
                  {settings.title.length} chars
                </span>
              </div>
              <textarea
                rows={3}
                value={settings.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="e.g. STOP MAKING THESE MISTAKES..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 font-bold text-xs focus:border-amber-400 focus:outline-none transition-colors"
              />

              {/* Quick Title Suggestions from transcript */}
              <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] text-zinc-500">Quick Ideas:</span>
                {suggestedTitles.map((phrase, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => update({ title: phrase })}
                    className="px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] border border-zinc-700 transition-colors truncate max-w-[200px]"
                    title={phrase}
                  >
                    {phrase}
                  </button>
                ))}
              </div>
            </div>

            {/* Click-to-Highlight Words in Title */}
            {titleWords.length > 0 && (
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-200 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Word Highlights ({settings.highlightColor || '#FCD905'})
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    Click word to highlight
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {titleWords.map((word, idx) => {
                    const clean = word.toLowerCase();
                    const isHl = (settings.highlightWords || []).includes(clean);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleHighlightWord(word)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                          isHl
                            ? 'bg-[#FCD905] text-black border-[#FCD905] shadow-md shadow-amber-400/20'
                            : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500'
                        }`}
                      >
                        {word}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Subtitle / Secondary Hook */}
            <div>
              <label className="font-semibold text-zinc-200 mb-1.5 block">
                Subtitle / Supporting Hook (Optional)
              </label>
              <input
                type="text"
                value={settings.subtitle || ''}
                onChange={(e) => update({ subtitle: e.target.value })}
                placeholder="e.g. Masterclass with AI subtitles"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 text-xs focus:border-amber-400 focus:outline-none transition-colors"
              />
            </div>

            {/* Creator Watermark */}
            <div>
              <label className="font-semibold text-zinc-200 mb-1.5 block">
                Creator Handle / Branding Watermark
              </label>
              <input
                type="text"
                value={settings.brandingText || ''}
                onChange={(e) => update({ brandingText: e.target.value })}
                placeholder="e.g. @creator or channel name"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 text-xs focus:border-amber-400 focus:outline-none transition-colors"
              />
            </div>
          </div>
        )}

        {/* SUB-TAB 3: BADGE PILL */}
        {activeTab === 'badge' && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-zinc-200 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-amber-400" />
                Badge Pill Tag
              </label>
              {settings.badgeText && (
                <button
                  type="button"
                  onClick={() => update({ badgeText: '' })}
                  className="text-[10px] text-red-400 hover:underline"
                >
                  Clear badge
                </button>
              )}
            </div>

            <input
              type="text"
              value={settings.badgeText || ''}
              onChange={(e) => update({ badgeText: e.target.value })}
              placeholder="e.g. MUST WATCH, PART 1, VIRAL"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 text-xs focus:border-amber-400 focus:outline-none font-bold tracking-wider"
            />

            {/* Quick Badge Chips */}
            <div>
              <span className="text-[10px] text-zinc-500 mb-1.5 block">Popular Badges:</span>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_BADGES.map((badge) => (
                  <button
                    key={badge}
                    type="button"
                    onClick={() => update({ badgeText: badge })}
                    className={`px-2 py-1 rounded-md text-[10px] font-semibold border transition-all ${
                      settings.badgeText === badge
                        ? 'bg-amber-400 text-black border-amber-400 font-bold'
                        : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    {badge}
                  </button>
                ))}
              </div>
            </div>

            {/* Badge Style & Color */}
            {settings.badgeText && (
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                <span className="font-semibold text-zinc-200 block">
                  Badge Appearance
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] text-zinc-400 mb-1 block">
                      Badge Style
                    </label>
                    <select
                      value={settings.badgeStyle || 'solid'}
                      onChange={(e) => update({ badgeStyle: e.target.value as any })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-zinc-200 text-xs focus:outline-none"
                    >
                      <option value="solid">Solid Fill</option>
                      <option value="glow">Neon Glow</option>
                      <option value="outline">Outlined Pill</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-400 mb-1 block">
                      Badge Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={settings.badgeColor || '#FCD905'}
                        onChange={(e) => update({ badgeColor: e.target.value })}
                        className="w-7 h-7 rounded border border-zinc-700 bg-transparent cursor-pointer"
                      />
                      <span className="font-mono text-[11px] text-amber-300 font-bold">
                        {settings.badgeColor || '#FCD905'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SUB-TAB 4: TYPOGRAPHY & COLORS */}
        {activeTab === 'typography' && (
          <div className="space-y-3.5">
            {/* Google Font Picker */}
            <div>
              <label className="font-semibold text-zinc-200 mb-1.5 block">
                Google Font Family
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsFontPickerOpen(!isFontPickerOpen)}
                  className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-xl px-3 py-2 text-left flex items-center justify-between text-zinc-200"
                >
                  <span
                    className="font-bold text-sm"
                    style={{ fontFamily: settings.fontFamily }}
                  >
                    {settings.fontFamily}
                  </span>
                  <span className="text-[10px] bg-zinc-850 px-2 py-0.5 rounded text-zinc-400 font-mono">
                    Change Font
                  </span>
                </button>

                {isFontPickerOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl p-2 z-30 max-h-56 overflow-y-auto space-y-1">
                    <input
                      type="text"
                      value={fontSearchQuery}
                      onChange={(e) => setFontSearchQuery(e.target.value)}
                      placeholder="Search Google fonts..."
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none mb-1.5"
                    />
                    {filteredFonts.map((font) => (
                      <button
                        key={font.name}
                        type="button"
                        onClick={() => {
                          update({ fontFamily: font.name });
                          setIsFontPickerOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                          settings.fontFamily === font.name
                            ? 'bg-amber-400 text-black font-bold'
                            : 'hover:bg-zinc-850 text-zinc-300'
                        }`}
                      >
                        <span style={{ fontFamily: font.name }} className="text-xs font-semibold">
                          {font.name}
                        </span>
                        <span className="text-[9px] px-1 rounded bg-zinc-800 text-zinc-400 font-mono">
                          {font.badge}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Font Size & Weight */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-zinc-300">
                    Font Size
                  </label>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {settings.fontSize}px
                  </span>
                </div>
                <input
                  type="range"
                  min={44}
                  max={130}
                  step={2}
                  value={settings.fontSize}
                  onChange={(e) => update({ fontSize: Number(e.target.value) })}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-300 mb-1 block">
                  Font Weight
                </label>
                <select
                  value={settings.fontWeight}
                  onChange={(e) => update({ fontWeight: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-1.5 text-zinc-200 text-xs focus:outline-none"
                >
                  <option value="700">700 Bold</option>
                  <option value="800">800 Extra Bold</option>
                  <option value="900">900 Black</option>
                </select>
              </div>
            </div>

            {/* Color Palette: Text & Highlight Color (#FCD905) */}
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
              <span className="font-semibold text-zinc-200 block">
                Color Palette
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-zinc-400 mb-1 block">
                    Primary Title Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.textColor}
                      onChange={(e) => update({ textColor: e.target.value })}
                      className="w-7 h-7 rounded border border-zinc-700 bg-transparent cursor-pointer"
                    />
                    <span className="font-mono text-[11px] text-zinc-300">
                      {settings.textColor}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-zinc-400 mb-1 block">
                    Highlight Accent Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.highlightColor || '#FCD905'}
                      onChange={(e) => update({ highlightColor: e.target.value })}
                      className="w-7 h-7 rounded border border-zinc-700 bg-transparent cursor-pointer"
                    />
                    <span className="font-mono text-[11px] text-amber-300 font-bold">
                      {settings.highlightColor || '#FCD905'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Stroke Outline & Shadow Blur */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-zinc-300">
                    Stroke Width
                  </label>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {settings.strokeWidth}px
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={14}
                  step={1}
                  value={settings.strokeWidth}
                  onChange={(e) => update({ strokeWidth: Number(e.target.value) })}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-zinc-300">
                    Shadow Blur
                  </label>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {settings.shadowBlur}px
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={2}
                  value={settings.shadowBlur}
                  onChange={(e) => update({ shadowBlur: Number(e.target.value) })}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>
            </div>

            {/* Uppercase & Glass Card toggles */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800">
              <label className="flex items-center gap-2 p-2 rounded-xl bg-zinc-950 border border-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.textTransform === 'uppercase'}
                  onChange={(e) =>
                    update({ textTransform: e.target.checked ? 'uppercase' : 'none' })
                  }
                  className="accent-amber-400 rounded"
                />
                <span className="text-zinc-300 font-semibold text-[11px]">
                  Uppercase All
                </span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded-xl bg-zinc-950 border border-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(settings.boxBackground)}
                  onChange={(e) => update({ boxBackground: e.target.checked })}
                  className="accent-amber-400 rounded"
                />
                <span className="text-zinc-300 font-semibold text-[11px]">
                  Glass Box Card
                </span>
              </label>
            </div>
          </div>
        )}

        {/* SUB-TAB 5: LAYOUT & BACKGROUND */}
        {activeTab === 'layout' && (
          <div className="space-y-3.5">
            {/* Vertical Placement */}
            <div>
              <label className="font-semibold text-zinc-200 mb-1.5 block">
                Vertical Placement
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['top', 'center', 'bottom', 'custom'] as const).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => update({ position: pos })}
                    className={`py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                      settings.position === pos
                        ? 'bg-amber-400 text-black font-bold'
                        : 'bg-zinc-950 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>

              {settings.position === 'custom' && (
                <div className="mt-2.5 p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-zinc-400">Vertical Offset (Y%)</span>
                    <span className="text-[10px] font-mono text-amber-300 font-bold">
                      {settings.customY ?? 50}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={85}
                    value={settings.customY ?? 50}
                    onChange={(e) => update({ customY: Number(e.target.value) })}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Horizontal Alignment */}
            <div>
              <label className="font-semibold text-zinc-200 mb-1.5 block">
                Horizontal Alignment
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => update({ textAlign: 'left' })}
                  className={`py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    settings.textAlign === 'left'
                      ? 'bg-amber-400 text-black font-bold'
                      : 'bg-zinc-950 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                  <span>Left</span>
                </button>

                <button
                  type="button"
                  onClick={() => update({ textAlign: 'center' })}
                  className={`py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    settings.textAlign === 'center'
                      ? 'bg-amber-400 text-black font-bold'
                      : 'bg-zinc-950 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <AlignCenter className="w-3.5 h-3.5" />
                  <span>Center</span>
                </button>

                <button
                  type="button"
                  onClick={() => update({ textAlign: 'right' })}
                  className={`py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    settings.textAlign === 'right'
                      ? 'bg-amber-400 text-black font-bold'
                      : 'bg-zinc-950 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <AlignRight className="w-3.5 h-3.5" />
                  <span>Right</span>
                </button>
              </div>
            </div>

            {/* Dark Vignette / Overlay */}
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-zinc-200">
                  Dark Vignette / Overlay
                </label>
                <span className="font-mono text-[10px] text-amber-300 font-bold">
                  {Math.round((settings.overlayDarkness ?? 0.6) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={0.95}
                step={0.05}
                value={settings.overlayDarkness ?? 0.6}
                onChange={(e) => update({ overlayDarkness: Number(e.target.value) })}
                className="w-full accent-amber-400 cursor-pointer"
              />

              <div>
                <label className="text-[10px] text-zinc-400 mb-1 block">
                  Gradient Overlay Style
                </label>
                <select
                  value={settings.overlayType || 'radial-vignette'}
                  onChange={(e) => update({ overlayType: e.target.value as any })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-zinc-200 text-xs focus:outline-none"
                >
                  <option value="radial-vignette">Radial Vignette (Punchy Center)</option>
                  <option value="linear-bottom">Linear Bottom (Anchor)</option>
                  <option value="linear-top">Linear Top (Header Focus)</option>
                  <option value="full-dark">Full Dimming</option>
                </select>
              </div>
            </div>

            {/* Background Source */}
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
              <label className="font-semibold text-zinc-200 block">
                Background Source
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => update({ backgroundType: 'project' })}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    settings.backgroundType !== 'gradient'
                      ? 'bg-amber-500/10 border-amber-400 text-amber-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  <span className="font-bold block text-xs">Project Media</span>
                  <span className="text-[10px] opacity-75">Current video frame</span>
                </button>

                <button
                  type="button"
                  onClick={() => update({ backgroundType: 'gradient' })}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    settings.backgroundType === 'gradient'
                      ? 'bg-amber-500/10 border-amber-400 text-amber-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  <span className="font-bold block text-xs">Studio Gradients</span>
                  <span className="text-[10px] opacity-75">Clean colored backdrop</span>
                </button>
              </div>

              {settings.backgroundType !== 'gradient' && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800 text-[11px]">
                  <div className="flex items-center gap-1.5 text-zinc-300">
                    <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-medium">Video Reel Sync:</span>
                  </div>
                  <span className="font-mono text-amber-300 font-bold uppercase text-[10px] px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">
                    {image?.fitMode === 'contain'
                      ? `Contain (${image?.position || 'center'} · ${image?.scale ?? 85}%)`
                      : 'Cover (Full Frame)'}
                  </span>
                </div>
              )}

              {settings.backgroundType === 'gradient' && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {THUMBNAIL_GRADIENTS.map((grad) => (
                    <button
                      key={grad.id}
                      type="button"
                      onClick={() => update({ gradientPreset: grad.id })}
                      className={`p-2 rounded-lg border text-center transition-all ${
                        settings.gradientPreset === grad.id
                          ? 'border-amber-400 ring-2 ring-amber-400/30'
                          : 'border-zinc-800 hover:border-zinc-700'
                      }`}
                      style={{ background: grad.css }}
                    >
                      <span className="text-[10px] font-bold text-white drop-shadow block">
                        {grad.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-zinc-800">
                <label className="flex items-center justify-center gap-2 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-300 text-xs font-semibold cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5 text-amber-400" />
                  <span>Upload Custom Background Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCustomBgUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Safe Area Guides Overlay */}
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-sky-400" />
                <div>
                  <p className="font-semibold text-zinc-200 text-xs">Safe Area Overlay</p>
                  <p className="text-[10px] text-zinc-500">
                    Shows 9:16 Reel UI safe zone & top margin guides
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.showSafeArea !== false}
                onChange={(e) => update({ showSafeArea: e.target.checked })}
                className="w-4 h-4 accent-amber-400 rounded cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>

      {/* Action Footer Buttons in Right Panel */}
      <div className="p-3 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onDownload?.('png')}
            className="flex items-center gap-1 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black font-bold rounded-lg text-xs shadow-md shadow-amber-400/20 active:scale-95 transition-all"
            title="Download PNG Thumbnail"
          >
            <Download className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Download PNG</span>
          </button>

          <button
            type="button"
            onClick={() => onDownload?.('jpeg')}
            className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-lg text-xs border border-zinc-700 transition-colors"
            title="Download JPEG"
          >
            JPEG
          </button>
        </div>

        {onApplyAsReelImage && (
          <button
            type="button"
            onClick={handleApplyCover}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              appliedNotice
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-amber-300'
            }`}
            title="Apply Thumbnail as Project Video Background"
          >
            {appliedNotice ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Applied!</span>
              </>
            ) : (
              <>
                <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Set as Reel Image</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
