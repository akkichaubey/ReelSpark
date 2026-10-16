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
  Square,
} from 'lucide-react';

export type ThumbnailSubTab =
  | 'presets'
  | 'content'
  | 'text'
  | 'badge'
  | 'typography'
  | 'effects'
  | 'layout'
  | 'position';

interface ThumbnailStylePanelProps {
  settings: ThumbnailSettings;
  onChangeSettings: (newSettings: ThumbnailSettings) => void;
  projectTitle?: string;
  captionGroups?: CaptionGroup[];
  image?: ImageAsset;
  onDownload?: (format: 'png' | 'jpeg') => void;
  onApplyAsReelImage?: () => void;
  activeSubTab?: ThumbnailSubTab;
  onSelectSubTab?: (tab: ThumbnailSubTab) => void;
}

export const ThumbnailStylePanel: React.FC<ThumbnailStylePanelProps> = ({
  settings,
  onChangeSettings,
  projectTitle,
  captionGroups = [],
  image,
  onDownload,
  onApplyAsReelImage,
  activeSubTab,
  onSelectSubTab,
}) => {
  const normalizeTab = (
    tab: ThumbnailSubTab
  ): 'presets' | 'content' | 'badge' | 'typography' | 'layout' => {
    if (tab === 'text') return 'content';
    if (tab === 'effects') return 'typography';
    if (tab === 'position') return 'layout';
    return tab;
  };

  const [internalTab, setInternalTab] = useState<
    'presets' | 'content' | 'badge' | 'typography' | 'layout'
  >('layout');
  const activeTab = normalizeTab((activeSubTab ?? internalTab) as ThumbnailSubTab);
  const setActiveTab = (tab: ThumbnailSubTab) => {
    const normalized = normalizeTab(tab);
    setInternalTab(normalized);
    onSelectSubTab?.(tab);
  };
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
      textAlign: settings.textAlign,
      customX: settings.customX,
      showSafeArea: settings.showSafeArea,
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
          { id: 'content', label: 'Text', icon: Type },
          { id: 'typography', label: 'Effects', icon: Sparkles },
          { id: 'badge', label: 'Badge', icon: Square },
          { id: 'layout', label: 'Position', icon: Layout },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-1.5 px-1.5 rounded-lg font-medium flex items-center justify-center gap-1 transition-all cursor-pointer ${
                isActive
                  ? 'bg-zinc-800 text-amber-300 font-semibold shadow-sm border border-amber-500/50'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-400' : 'text-zinc-400'}`} />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
        {/* SUB-TAB 1: 1-CLICK PRESETS */}
        {activeTab === 'presets' && (
          <div className="space-y-3">
            {/* Quick Customize Current Elements Banner */}
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Customize Active Elements</span>
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {settings.preset ? settings.preset.toUpperCase() : 'CUSTOM'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('layout')}
                  className="px-2 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-amber-500/30 font-semibold text-[10px] flex items-center justify-center gap-1 cursor-pointer transition-colors"
                >
                  <Layout className="w-3 h-3 text-amber-400" />
                  <span>Position</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('badge')}
                  className="px-2 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 font-semibold text-[10px] flex items-center justify-center gap-1 cursor-pointer transition-colors"
                >
                  <Square className="w-3 h-3 text-amber-400" />
                  <span>Badge</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('content')}
                  className="px-2 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-200 border border-zinc-700 font-semibold text-[10px] flex items-center justify-center gap-1 cursor-pointer transition-colors"
                >
                  <Type className="w-3 h-3 text-amber-400" />
                  <span>Text</span>
                </button>
              </div>
            </div>

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
            {/* Enable / Disable Toggle Header */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-xl transition-colors ${
                    settings.badgeEnabled !== false
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                  }`}
                >
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <label
                    className="font-bold text-xs text-zinc-100 block cursor-pointer select-none"
                    onClick={() => update({ badgeEnabled: settings.badgeEnabled === false ? true : false })}
                  >
                    Hook Badge Pill
                  </label>
                  <span className="text-[10px] text-zinc-400 block">
                    {settings.badgeEnabled !== false ? 'Active & visible on thumbnail' : 'Disabled / hidden from thumbnail'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={settings.badgeEnabled !== false}
                onClick={() => update({ badgeEnabled: settings.badgeEnabled === false ? true : false })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.badgeEnabled !== false ? 'bg-amber-400' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-black shadow-lg ring-0 transition duration-200 ease-in-out ${
                    settings.badgeEnabled !== false ? 'translate-x-5' : 'translate-x-0 bg-zinc-300'
                  }`}
                />
              </button>
            </div>

            {/* When Disabled State Notice */}
            {settings.badgeEnabled === false && (
              <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-center space-y-2">
                <Tag className="w-7 h-7 text-zinc-600 mx-auto" />
                <p className="text-xs font-semibold text-zinc-300">Badge Element is Currently Disabled</p>
                <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
                  The hook badge and its spacing are hidden from the thumbnail cover. Enable it above to customize and display.
                </p>
                <button
                  type="button"
                  onClick={() => update({ badgeEnabled: true })}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs shadow-md transition-all inline-flex items-center gap-1.5 mt-1 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Enable Badge Element</span>
                </button>
              </div>
            )}

            {/* When Enabled: Full Customization & Spacing */}
            {settings.badgeEnabled !== false && (
              <>
                {/* 1. Element Spacing Adjustment (Badge to Title) */}
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                      Spacing to Title (Element Gap)
                    </label>
                    <span className="font-mono text-[11px] text-amber-300 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      {settings.badgeSpacing ?? 24}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={2}
                    value={settings.badgeSpacing ?? 24}
                    onChange={(e) => update({ badgeSpacing: Number(e.target.value) })}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[10px] text-zinc-500 mr-1">Quick Presets:</span>
                    {[
                      { label: 'Tight', val: 8 },
                      { label: 'Normal', val: 24 },
                      { label: 'Relaxed', val: 44 },
                      { label: 'Wide', val: 68 },
                    ].map((p) => (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => update({ badgeSpacing: p.val })}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                          (settings.badgeSpacing ?? 24) === p.val
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                            : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                        }`}
                      >
                        {p.label} ({p.val}px)
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Badge Text Input & Popular Viral Tags */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-zinc-200 text-xs flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-amber-400" />
                      Badge Text / Hook
                    </label>
                    {settings.badgeText && (
                      <button
                        type="button"
                        onClick={() => update({ badgeText: '' })}
                        className="text-[10px] text-red-400 hover:underline cursor-pointer"
                      >
                        Clear text
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
                    <span className="text-[10px] text-zinc-500 mb-1.5 block">Popular Hook Badges:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_BADGES.map((badge) => (
                        <button
                          key={badge}
                          type="button"
                          onClick={() => update({ badgeText: badge })}
                          className={`px-2 py-1 rounded-md text-[10px] font-semibold border transition-all cursor-pointer ${
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
                </div>

                {/* 3. Badge Style & Shape Customization */}
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                  <span className="font-bold text-xs text-zinc-200 block">
                    Badge Style & Shape
                  </span>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] text-zinc-400 mb-1 block">
                        Visual Style
                      </label>
                      <select
                        value={settings.badgeStyle || 'solid'}
                        onChange={(e) => update({ badgeStyle: e.target.value as any })}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 text-xs focus:outline-none"
                      >
                        <option value="solid">Solid Fill (Punchy)</option>
                        <option value="glow">Neon Glow (Vibrant)</option>
                        <option value="outline">Outlined Pill</option>
                        <option value="glass">Frosted Glass</option>
                        <option value="gradient">Vibrant Gradient</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-zinc-400 mb-1 block">
                        Badge Shape
                      </label>
                      <select
                        value={settings.badgeShape || 'pill'}
                        onChange={(e) => update({ badgeShape: e.target.value as any })}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 text-xs focus:outline-none"
                      >
                        <option value="pill">Pill (Fully Rounded)</option>
                        <option value="rounded">Rounded Card</option>
                        <option value="sharp">Sharp Rectangle</option>
                      </select>
                    </div>
                  </div>

                  {settings.badgeShape === 'rounded' && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-zinc-400">Corner Radius</label>
                        <span className="text-[10px] font-mono text-amber-300 font-bold">
                          {settings.badgeBorderRadius ?? 10}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={2}
                        max={24}
                        value={settings.badgeBorderRadius ?? 10}
                        onChange={(e) => update({ badgeBorderRadius: Number(e.target.value) })}
                        className="w-full accent-amber-400 cursor-pointer"
                      />
                    </div>
                  )}

                  {settings.badgeStyle === 'glow' && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-zinc-400">Neon Glow Blur</label>
                        <span className="text-[10px] font-mono text-amber-300 font-bold">
                          {settings.badgeGlowBlur ?? 18}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={6}
                        max={36}
                        value={settings.badgeGlowBlur ?? 18}
                        onChange={(e) => update({ badgeGlowBlur: Number(e.target.value) })}
                        className="w-full accent-amber-400 cursor-pointer"
                      />
                    </div>
                  )}
                </div>

                {/* 4. Colors & Contrast Customization */}
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                  <span className="font-bold text-xs text-zinc-200 block">
                    Colors & Palette
                  </span>

                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Background Color */}
                    <div>
                      <label className="text-[10px] text-zinc-400 mb-1 block">
                        Background Color
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

                    {/* Text Color */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-zinc-400 block">
                          Text Color
                        </label>
                        <button
                          type="button"
                          onClick={() => update({ badgeAutoTextColor: !settings.badgeAutoTextColor })}
                          className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                            settings.badgeAutoTextColor !== false
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          {settings.badgeAutoTextColor !== false ? 'Auto (Contrast)' : 'Custom'}
                        </button>
                      </div>

                      {settings.badgeAutoTextColor !== false ? (
                        <span className="text-[10px] text-zinc-500 italic block pt-1">
                          Auto black/white contrast
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={settings.badgeTextColor || '#000000'}
                            onChange={(e) => update({ badgeTextColor: e.target.value, badgeAutoTextColor: false })}
                            className="w-7 h-7 rounded border border-zinc-700 bg-transparent cursor-pointer"
                          />
                          <span className="font-mono text-[11px] text-zinc-300 font-bold">
                            {settings.badgeTextColor || '#000000'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick Color Swatches */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-zinc-500 mr-1">Swatches:</span>
                    {[
                      '#FCD905',
                      '#EF4444',
                      '#3B82F6',
                      '#10B981',
                      '#8B5CF6',
                      '#EC4899',
                      '#FFFFFF',
                      '#18181B',
                    ].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => update({ badgeColor: c })}
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded-full border border-white/20 transition-transform cursor-pointer ${
                          settings.badgeColor === c ? 'scale-125 ring-2 ring-amber-400' : 'hover:scale-110'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Border Width & Color */}
                  <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-zinc-850">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-zinc-400">Border Width</label>
                        <span className="text-[10px] font-mono text-zinc-300 font-bold">
                          {settings.badgeBorderWidth ?? (settings.badgeStyle === 'outline' ? 2.5 : 0)}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={6}
                        step={0.5}
                        value={settings.badgeBorderWidth ?? (settings.badgeStyle === 'outline' ? 2.5 : 0)}
                        onChange={(e) => update({ badgeBorderWidth: Number(e.target.value) })}
                        className="w-full accent-amber-400 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-zinc-400 mb-1 block">Border Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={settings.badgeBorderColor || '#FFFFFF'}
                          onChange={(e) => update({ badgeBorderColor: e.target.value })}
                          className="w-6 h-6 rounded border border-zinc-700 bg-transparent cursor-pointer"
                        />
                        <span className="font-mono text-[10px] text-zinc-400">
                          {settings.badgeBorderColor || '#FFFFFF'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. Typography & Dimensions Customization */}
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                  <span className="font-bold text-xs text-zinc-200 block">
                    Typography & Padding
                  </span>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-zinc-400">Font Size</label>
                        <span className="text-[10px] font-mono text-amber-300 font-bold">
                          {settings.badgeFontSize ?? 26}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={16}
                        max={48}
                        value={settings.badgeFontSize ?? 26}
                        onChange={(e) => update({ badgeFontSize: Number(e.target.value) })}
                        className="w-full accent-amber-400 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-zinc-400 mb-1 block">Font Weight</label>
                      <select
                        value={settings.badgeFontWeight || '800'}
                        onChange={(e) => update({ badgeFontWeight: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-200 text-xs focus:outline-none"
                      >
                        <option value="700">Bold (700)</option>
                        <option value="800">Extra Bold (800)</option>
                        <option value="900">Black (900)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-zinc-400">Horizontal Padding</label>
                        <span className="text-[10px] font-mono text-zinc-300 font-bold">
                          {settings.badgePaddingX ?? 18}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={8}
                        max={40}
                        value={settings.badgePaddingX ?? 18}
                        onChange={(e) => update({ badgePaddingX: Number(e.target.value) })}
                        className="w-full accent-amber-400 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-zinc-400">Vertical Padding</label>
                        <span className="text-[10px] font-mono text-zinc-300 font-bold">
                          {settings.badgePaddingY ?? 9}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={2}
                        max={20}
                        value={settings.badgePaddingY ?? 9}
                        onChange={(e) => update({ badgePaddingY: Number(e.target.value) })}
                        className="w-full accent-amber-400 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-zinc-400">Letter Spacing</label>
                      <span className="text-[10px] font-mono text-zinc-300 font-bold">
                        {settings.badgeLetterSpacing ?? 1}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-1}
                      max={8}
                      value={settings.badgeLetterSpacing ?? 1}
                      onChange={(e) => update({ badgeLetterSpacing: Number(e.target.value) })}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>
                </div>
              </>
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

        {/* SUB-TAB 5: POSITION, ALIGNMENT & SAFE AREA GUIDES */}
        {activeTab === 'layout' && (
          <div className="space-y-4">
            {/* Horizontal Alignment */}
            <div>
              <label className="block text-zinc-300 font-medium mb-1.5">Horizontal Alignment</label>
              <div className="grid grid-cols-4 gap-1.5">
                {(
                  [
                    { id: 'left', icon: AlignLeft, label: 'Left' },
                    { id: 'center', icon: AlignCenter, label: 'Center' },
                    { id: 'right', icon: AlignRight, label: 'Right' },
                    { id: 'custom', icon: SlidersHorizontal, label: 'Custom' },
                  ] as const
                ).map(({ id, icon: Icon, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => update({ textAlign: id })}
                    className={`py-1.5 rounded-lg border text-center font-medium flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      settings.textAlign === id
                        ? 'bg-amber-500 text-black border-amber-400 font-semibold'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="text-[11px]">{label}</span>
                  </button>
                ))}
              </div>

              {settings.textAlign === 'custom' && (
                <div className="mt-2.5 p-2.5 bg-zinc-950 rounded-lg border border-zinc-800 space-y-2">
                  <div className="flex justify-between items-center text-zinc-400 text-[11px]">
                    <span>Horizontal Position (X%)</span>
                    <span className="font-mono text-amber-400">{settings.customX ?? 50}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    step="1"
                    value={settings.customX ?? 50}
                    onChange={(e) => update({ customX: Number(e.target.value) })}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
                    <span>10% (Left)</span>
                    <span>50% (Center)</span>
                    <span>90% (Right)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Vertical Anchor */}
            <div>
              <label className="block text-zinc-300 font-medium mb-1.5">Vertical Anchor</label>
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
                    onClick={() => update({ position: pos.id })}
                    className={`py-1.5 rounded-lg border text-center font-medium transition-all cursor-pointer ${
                      settings.position === pos.id
                        ? 'bg-amber-500 text-black border-amber-400 font-semibold'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <span className="text-[11px]">{pos.label}</span>
                  </button>
                ))}
              </div>

              {settings.position === 'custom' && (
                <div className="mt-2.5 p-2.5 bg-zinc-950 rounded-lg border border-zinc-800 space-y-2">
                  <div className="flex justify-between items-center text-zinc-400 text-[11px]">
                    <span>Vertical Position (Y%)</span>
                    <span className="font-mono text-amber-400">{settings.customY ?? 50}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    step="1"
                    value={settings.customY ?? 50}
                    onChange={(e) => update({ customY: Number(e.target.value) })}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
                    <span>10% (Top)</span>
                    <span>50% (Center)</span>
                    <span>90% (Bottom)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Safe Area Overlay Guide Toggle */}
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
                checked={settings.showSafeArea !== false}
                onChange={(e) => update({ showSafeArea: e.target.checked })}
                className="w-4 h-4 accent-amber-400 rounded cursor-pointer"
              />
            </div>

            {/* Element Vertical Spacing */}
            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                  Element Vertical Spacing
                </label>
              </div>

              {/* Badge to Title Spacing */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-zinc-400">Badge to Title Gap</span>
                  <span className="text-[10px] font-mono text-amber-300 font-bold">
                    {settings.badgeSpacing ?? 24}px
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={2}
                  value={settings.badgeSpacing ?? 24}
                  onChange={(e) => update({ badgeSpacing: Number(e.target.value) })}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              {/* Title to Subtitle Spacing */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-zinc-400">Title to Subtitle Gap</span>
                  <span className="text-[10px] font-mono text-amber-300 font-bold">
                    {settings.subtitleSpacing ?? 24}px
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={2}
                  value={settings.subtitleSpacing ?? 24}
                  onChange={(e) => update({ subtitleSpacing: Number(e.target.value) })}
                  className="w-full accent-amber-400 cursor-pointer"
                />
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
