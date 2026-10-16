'use strict';
'use client';

import React, { useState, useEffect } from 'react';
import {
  CaptionStyle,
  CaptionMode,
  AnimationPreset,
  HighlightAnimation,
  CaptionPosition,
  FontWeight,
  TextAlignment,
  BackgroundStyle,
  TextEffectType,
} from '@/lib/caption-maker/types';
import {
  REEL_STYLE_PRESETS,
} from '@/lib/caption-maker/sample-data';
import {
  Type,
  Palette,
  Sparkles,
  Layout,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ShieldAlert,
  Wand2,
  Square,
  Sun,
  Flame,
  ZoomIn,
  Search,
  Check,
  ChevronDown,
  ChevronUp,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import {
  POPULAR_GOOGLE_FONTS,
  loadGoogleFontInDocument,
  loadFontBatch,
} from '@/lib/caption-maker/google-fonts';

interface CaptionStylePanelProps {
  style: CaptionStyle;
  onChangeStyle: (newStyle: CaptionStyle) => void;
}

export const CaptionStylePanel: React.FC<CaptionStylePanelProps> = ({
  style,
  onChangeStyle,
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'typography' | 'effects' | 'background' | 'layout'>('presets');
  const [isFontPickerOpen, setIsFontPickerOpen] = useState<boolean>(false);
  const [fontSearchQuery, setFontSearchQuery] = useState<string>('');
  const [fontCategoryFilter, setFontCategoryFilter] = useState<
    'all' | 'viral' | 'clean' | 'display' | 'serif' | 'devanagari'
  >('all');

  const currentFontName = style.fontFamily?.split(',')[0].replace(/["']/g, '').trim() || 'Inter';

  // Preload current font and picker fonts
  useEffect(() => {
    if (style.fontFamily) {
      loadGoogleFontInDocument(style.fontFamily);
    }
  }, [style.fontFamily]);

  useEffect(() => {
    if (isFontPickerOpen) {
      const fontsToPreload = POPULAR_GOOGLE_FONTS.filter(
        (f) => fontCategoryFilter === 'all' || f.category === fontCategoryFilter
      ).map((f) => f.name);
      loadFontBatch(fontsToPreload);
    }
  }, [isFontPickerOpen, fontCategoryFilter]);

  const selectFont = (fontName: string) => {
    loadGoogleFontInDocument(fontName);
    update({ fontFamily: `"${fontName}", sans-serif` });
    setIsFontPickerOpen(false);
    setFontSearchQuery('');
  };

  const update = (partial: Partial<CaptionStyle>) => {
    onChangeStyle({ ...style, ...partial });
  };

  const applyPreset = (presetStyle: Partial<CaptionStyle>) => {
    if (presetStyle.fontFamily) {
      loadGoogleFontInDocument(presetStyle.fontFamily);
    }
    onChangeStyle({ ...style, ...presetStyle });
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
        <span className="text-[11px] bg-amber-500/10 text-amber-300 border border-amber-500/25 px-2 py-0.5 rounded-full capitalize font-medium">
          {style.captionMode.replace('-', ' ')}
        </span>
      </div>

      {/* Modern Navigation Tabs (Inspired by VN / CapCut / Instagram) */}
      <div className="flex items-center border-b border-zinc-800 bg-zinc-950/50 p-1 text-[11px]">
        {[
          { id: 'presets', label: 'Presets', icon: Wand2 },
          { id: 'typography', label: 'Text', icon: Type },
          { id: 'effects', label: 'Effects', icon: Sparkles },
          { id: 'background', label: 'Badge', icon: Square },
          { id: 'layout', label: 'Position', icon: Layout },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-1.5 px-1 flex items-center justify-center gap-1 rounded-md font-medium transition-all cursor-pointer ${
                isActive
                  ? 'bg-zinc-800 text-amber-300 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
              }`}
            >
              <Icon className="w-3 h-3 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar text-xs">
        {/* ========================================================================= */}
        {/* TAB 1: 1-CLICK VIRAL PRESETS (VN / Instagram / CapCut templates)          */}
        {/* ========================================================================= */}
        {activeTab === 'presets' && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-zinc-200 font-semibold flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  1-Click Viral Reel Templates
                </label>
                <span className="text-[10px] text-zinc-500">Auto-styles fonts, glow & layout</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {REEL_STYLE_PRESETS.map((preset) => {
                  const isActive =
                    (preset.id === 'cinematic-subtitle' &&
                      style.fontFamily?.includes('Montserrat') &&
                      style.animationPreset === 'clean') ||
                    (style.fontFamily === preset.style.fontFamily &&
                      style.animationPreset === preset.style.animationPreset &&
                      style.strokeWidth === preset.style.strokeWidth &&
                      style.textEffect === preset.style.textEffect);

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.style)}
                      className={`group relative p-2.5 rounded-xl border text-left flex flex-col justify-between cursor-pointer transition-all ${
                        isActive
                          ? 'border-amber-400 bg-zinc-900/90 shadow-md shadow-amber-400/20 ring-1 ring-amber-400'
                          : 'border-zinc-800 bg-zinc-950/70 hover:border-amber-400/60 hover:bg-zinc-900/80 shadow-sm hover:shadow-amber-500/10'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span
                          className={`font-semibold text-[11px] transition-colors ${
                            isActive ? 'text-amber-300 font-bold' : 'text-zinc-100 group-hover:text-amber-300'
                          }`}
                        >
                          {preset.name}
                        </span>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold border ${
                            isActive
                              ? 'bg-amber-400 text-black border-amber-300 shadow-sm'
                              : 'bg-zinc-800/80 text-amber-400 border-zinc-700'
                          }`}
                        >
                          {preset.badge}
                        </span>
                      </div>
                      {/* Visual mini-preview badge */}
                      <div
                        className={`mt-1 py-1 px-2 rounded-md ${preset.previewBg} ${preset.previewColor} border ${
                          preset.previewBorder || 'border-transparent'
                        } text-center font-bold text-[10px] tracking-wide truncate shadow-inner`}
                      >
                        HELLO <span className="underline decoration-current">REEL</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 mt-1.5 line-clamp-1 leading-tight">
                        {preset.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Display Mode Selector */}
            <div className="pt-2 border-t border-zinc-800/80">
              <label className="block text-zinc-300 font-medium mb-1.5 flex items-center gap-1.5">
                <Layout className="w-3.5 h-3.5 text-amber-400" />
                Caption Animation Mode
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'phrase-highlight', label: 'Phrase Glow', desc: 'Full line with active glow' },
                    { id: 'word-by-word', label: 'Solo Word', desc: 'Single word punch on beat' },
                    { id: 'kinetic', label: 'Kinetic', desc: 'Floating dynamic bounce' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => update({ captionMode: mode.id as CaptionMode })}
                    className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      style.captionMode === mode.id
                        ? 'bg-amber-500/15 border-amber-500/60 text-white ring-1 ring-amber-500/30'
                        : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <span className="font-semibold text-[11px] block">{mode.label}</span>
                    <span className="text-[9px] text-zinc-500 mt-1 line-clamp-1">{mode.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: TYPOGRAPHY & TEXT SETTINGS (Font, Weight, Tracking, Leading)       */}
        {/* ========================================================================= */}
        {activeTab === 'typography' && (
          <div className="space-y-4">
            {/* Font Family & Weight */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-zinc-200 font-semibold flex items-center gap-1.5 text-xs">
                  <Type className="w-3.5 h-3.5 text-amber-400" />
                  Font Family
                </label>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                  Google Fonts
                </span>
              </div>

              {/* Current Font Trigger & Weight Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* Google Font Picker Trigger Button */}
                <button
                  type="button"
                  onClick={() => setIsFontPickerOpen(!isFontPickerOpen)}
                  className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-amber-400/80 text-left flex items-center justify-between transition-all cursor-pointer group min-w-0"
                >
                  <div className="min-w-0 pr-1">
                    <span
                      style={{ fontFamily: style.fontFamily }}
                      className="font-bold text-zinc-100 text-xs block truncate group-hover:text-amber-300"
                    >
                      {currentFontName}
                    </span>
                    <span className="text-[9px] text-zinc-500 block truncate">
                      Browse or search Google fonts
                    </span>
                  </div>
                  <div className="p-1 rounded bg-zinc-900 text-zinc-400 group-hover:text-amber-300 shrink-0">
                    {isFontPickerOpen ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </div>
                </button>

                {/* Font Weight Dropdown */}
                <select
                  value={style.fontWeight}
                  onChange={(e) =>
                    update({ fontWeight: e.target.value as FontWeight })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg p-2 focus:border-amber-400 focus:outline-none text-xs truncate"
                >
                  <option value="normal">Regular (400)</option>
                  <option value="medium">Medium (500)</option>
                  <option value="semibold">Semibold (600)</option>
                  <option value="bold">Bold (700)</option>
                  <option value="black">Black Heavy (900)</option>
                </select>
              </div>

              {/* Inline Searchable Google Fonts Explorer */}
              {isFontPickerOpen && (
                <div className="p-3 bg-zinc-950 border border-amber-500/40 rounded-xl space-y-3 shadow-2xl animate-in fade-in duration-150">
                  {/* Search Input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={fontSearchQuery}
                      onChange={(e) => setFontSearchQuery(e.target.value)}
                      placeholder="Search 50+ viral fonts or type ANY Google font..."
                      className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:border-amber-400 placeholder:text-zinc-500"
                      autoFocus
                    />
                  </div>

                  {/* Custom Font Quick-Apply Card (allows ANY Google font on Earth!) */}
                  {fontSearchQuery.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => selectFont(fontSearchQuery.trim())}
                      className="w-full p-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/50 rounded-lg text-amber-300 font-bold text-xs flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Plus className="w-3.5 h-3.5 stroke-[2.5] text-amber-400 shrink-0" />
                        <span className="truncate">Use Custom Google Font: &quot;{fontSearchQuery.trim()}&quot;</span>
                      </div>
                      <span className="text-[10px] bg-amber-400 text-black px-1.5 py-0.5 rounded font-bold shrink-0">
                        Apply
                      </span>
                    </button>
                  )}

                  {/* Category Filter Pills */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 custom-scrollbar text-[10px]">
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'viral', label: 'Viral Bold' },
                      { id: 'clean', label: 'Clean Sans' },
                      { id: 'display', label: 'Display & Funky' },
                      { id: 'serif', label: 'Cinema Serif' },
                      { id: 'devanagari', label: 'Devanagari (Hindi)' },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setFontCategoryFilter(cat.id as any)}
                        className={`px-2 py-0.5 rounded-full font-medium whitespace-nowrap cursor-pointer transition-colors ${
                          fontCategoryFilter === cat.id
                            ? 'bg-amber-400 text-black font-bold'
                            : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {/* Curated Google Fonts List */}
                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                    {POPULAR_GOOGLE_FONTS.filter((f) => {
                      const matchCat =
                        fontCategoryFilter === 'all' || f.category === fontCategoryFilter;
                      const matchQuery =
                        !fontSearchQuery.trim() ||
                        f.name.toLowerCase().includes(fontSearchQuery.toLowerCase());
                      return matchCat && matchQuery;
                    }).map((f) => {
                      const isSelected =
                        currentFontName.toLowerCase() === f.name.toLowerCase();
                      return (
                        <button
                          key={f.name}
                          type="button"
                          onClick={() => selectFont(f.name)}
                          className={`w-full p-2 rounded-lg border text-left flex items-center justify-between transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                              : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-2">
                              <span
                                style={{ fontFamily: `"${f.name}", sans-serif` }}
                                className="font-bold text-xs truncate"
                              >
                                {f.name}
                              </span>
                              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-800 text-amber-400 font-bold border border-zinc-700">
                                {f.badge}
                              </span>
                            </div>
                            <span className="text-[10px] text-zinc-500 block truncate mt-0.5">
                              {f.description}
                            </span>
                          </div>
                          {isSelected && (
                            <Check className="w-4 h-4 text-amber-400 shrink-0 stroke-[3]" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Close / Done footer */}
                  <div className="flex items-center justify-between pt-1 border-t border-zinc-800 text-[10px] text-zinc-500">
                    <span>Loads automatically from Google Fonts CDN</span>
                    <button
                      type="button"
                      onClick={() => setIsFontPickerOpen(false)}
                      className="text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Font Size Slider */}
            <div>
              <div className="flex justify-between items-center mb-1 text-zinc-300">
                <label className="font-medium text-[11px]">Font Size</label>
                <span className="font-mono text-amber-400 font-bold">{style.fontSize}px</span>
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

            {/* Letter Spacing (Tracking) & Line Height (Leading) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <div className="flex justify-between items-center mb-1 text-zinc-300">
                  <label className="font-medium text-[11px] truncate">Letter Spacing</label>
                  <span className="font-mono text-amber-400 shrink-0 text-[11px] font-bold">{style.letterSpacing ?? 0}px</span>
                </div>
                <input
                  type="range"
                  min="-2"
                  max="10"
                  step="1"
                  value={style.letterSpacing ?? 0}
                  onChange={(e) => update({ letterSpacing: Number(e.target.value) })}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div className="min-w-0">
                <div className="flex justify-between items-center mb-1 text-zinc-300">
                  <label className="font-medium text-[11px] truncate">Line Height</label>
                  <span className="font-mono text-amber-400 shrink-0 text-[11px] font-bold">{(style.lineHeight ?? 1.3).toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="1.8"
                  step="0.05"
                  value={style.lineHeight ?? 1.3}
                  onChange={(e) => update({ lineHeight: Number(e.target.value) })}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>
            </div>

            {/* Colors (Normal & Active/Spoken Word) */}
            <div className="grid grid-cols-2 gap-3">
              {/* Normal Text Color Card */}
              <div className="p-2.5 bg-zinc-950/80 border border-zinc-800 rounded-lg space-y-2">
                <label className="block text-zinc-300 font-medium text-[11px]">
                  Normal Text Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={style.textColor?.startsWith('#') && style.textColor.length === 7 ? style.textColor : '#FFFFFF'}
                    onChange={(e) => update({ textColor: e.target.value })}
                    className="w-7 h-7 rounded border-0 cursor-pointer bg-transparent shrink-0"
                    title="Choose normal text color"
                  />
                  <input
                    type="text"
                    value={style.textColor}
                    onChange={(e) => update({ textColor: e.target.value })}
                    maxLength={7}
                    placeholder="#FFFFFF"
                    className="w-20 bg-zinc-900 border border-zinc-700 text-zinc-200 font-mono text-[11px] px-2 py-1 rounded focus:outline-none focus:border-amber-400 uppercase"
                  />
                </div>
                {/* Quick Swatches for Normal Text */}
                <div className="flex items-center gap-1.5 pt-1">
                  {[
                    { col: '#FFFFFF', title: 'Pure White' },
                    { col: '#FFFBEB', title: 'Warm Cream' },
                    { col: '#D1D5DB', title: 'Soft Gray' },
                    { col: '#93C5FD', title: 'Ice Blue' },
                    { col: '#FCD905', title: 'Yellow (#FCD905)' },
                  ].map((s) => (
                    <button
                      key={s.col}
                      type="button"
                      onClick={() => update({ textColor: s.col })}
                      style={{ backgroundColor: s.col }}
                      title={s.title}
                      className={`w-4 h-4 rounded-full border cursor-pointer transition-transform hover:scale-125 ${
                        style.textColor.toUpperCase() === s.col.toUpperCase()
                          ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-zinc-900 border-white'
                          : 'border-zinc-700'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Active / Spoken Word Color Card */}
              <div className="p-2.5 bg-zinc-950/80 border border-zinc-800 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-amber-400 font-medium text-[11px]">
                    Active / Spoken Color
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      update({
                        importantColor: '#FCD905',
                        glowColor: style.textEffect === 'neon-glow' ? '#FCD905' : style.glowColor,
                      })
                    }
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors cursor-pointer"
                    title="Click to reset active color to default #FCD905"
                  >
                    Default: #FCD905
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={style.importantColor?.startsWith('#') && style.importantColor.length === 7 ? style.importantColor : '#FCD905'}
                    onChange={(e) =>
                      update({
                        importantColor: e.target.value,
                        glowColor: style.textEffect === 'neon-glow' ? e.target.value : style.glowColor,
                      })
                    }
                    className="w-7 h-7 rounded border-0 cursor-pointer bg-transparent shrink-0"
                    title="Choose active spoken word color"
                  />
                  <input
                    type="text"
                    value={style.importantColor}
                    onChange={(e) =>
                      update({
                        importantColor: e.target.value,
                        glowColor: style.textEffect === 'neon-glow' ? e.target.value : style.glowColor,
                      })
                    }
                    maxLength={7}
                    placeholder="#FCD905"
                    className="w-20 bg-zinc-900 border border-zinc-700 text-amber-300 font-mono text-[11px] px-2 py-1 rounded focus:outline-none focus:border-amber-400 uppercase font-semibold"
                  />
                </div>
                {/* Quick Swatches for Active Spoken Word */}
                <div className="flex items-center gap-1.5 pt-1">
                  {[
                    { col: '#FCD905', title: 'Viral Yellow (Default)' },
                    { col: '#00F2FE', title: 'Neon Cyan' },
                    { col: '#00FF66', title: 'Vibrant Green' },
                    { col: '#FF007A', title: 'Hot Pink' },
                    { col: '#FF6B00', title: 'Flame Orange' },
                  ].map((s) => (
                    <button
                      key={s.col}
                      type="button"
                      onClick={() =>
                        update({
                          importantColor: s.col,
                          glowColor: style.textEffect === 'neon-glow' ? s.col : style.glowColor,
                        })
                      }
                      style={{ backgroundColor: s.col }}
                      title={s.title}
                      className={`w-4 h-4 rounded-full border cursor-pointer transition-transform hover:scale-125 ${
                        style.importantColor.toUpperCase() === s.col.toUpperCase()
                          ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-zinc-900 border-white'
                          : 'border-zinc-700'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Normal Text Opacity Slider (Inactive Words Dimming) */}
            <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-lg space-y-2">
              <div className="flex justify-between items-center text-zinc-300">
                <div>
                  <label className="font-semibold text-[11px] block text-zinc-200">
                    Normal Text Opacity
                  </label>
                  <span className="text-[10px] text-zinc-500 block">
                    Dims inactive words in phrase mode for reader focus
                  </span>
                </div>
                <span className="font-mono text-amber-400 font-bold text-xs bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                  {Math.round((style.textOpacity ?? 1.0) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.10"
                max="1.00"
                step="0.05"
                value={style.textOpacity ?? 1.0}
                onChange={(e) => update({ textOpacity: Number(e.target.value) })}
                className="w-full accent-amber-400 cursor-pointer"
              />
              <div className="flex items-center justify-between gap-1 pt-1">
                {[
                  { val: 0.2, label: '20% Ghost' },
                  { val: 0.4, label: '40% Muted' },
                  { val: 0.65, label: '65% Dim' },
                  { val: 1.0, label: '100% Solid (Default)' },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => update({ textOpacity: item.val })}
                    className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                      Math.abs((style.textOpacity ?? 1.0) - item.val) < 0.03
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-semibold'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Transform (ALL CAPS) */}
            <label className="flex items-center gap-2 cursor-pointer bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-300 hover:border-zinc-700">
              <input
                type="checkbox"
                checked={style.uppercase}
                onChange={(e) => update({ uppercase: e.target.checked })}
                className="accent-amber-400 rounded"
              />
              <span className="font-semibold text-[11px]">ALL CAPS (UPPERCASE TRANSFORMATION)</span>
            </label>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: EFFECTS, GLOW & OUTLINE (Instagram & VN Style FX)                  */}
        {/* ========================================================================= */}
        {activeTab === 'effects' && (
          <div className="space-y-4">
            {/* Animation Preset & Highlight Effect */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-zinc-300 font-medium mb-1.5 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Motion Preset
                </label>
                <select
                  value={style.animationPreset}
                  onChange={(e) =>
                    update({ animationPreset: e.target.value as AnimationPreset })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg p-2 focus:border-amber-400 focus:outline-none"
                >
                  <option value="words-slide-up">Words Slide Up (GSAP)</option>
                  <option value="words-rotate-in">Words Rotate In 3D (GSAP)</option>
                  <option value="letters-slide-up">Letters Slide Up (GSAP)</option>
                  <option value="letters-slide-down">Letters Slide Down (GSAP)</option>
                  <option value="punch">Punch (Hormozi Snap)</option>
                  <option value="pop">Pop (Bouncy Overshoot)</option>
                  <option value="kinetic">Kinetic (Beat Wiggle)</option>
                  <option value="clean">Clean (Smooth Fade)</option>
                  <option value="minimal">Minimal (Static Color)</option>
                </select>
              </div>

              <div className="min-w-0">
                <label className="block text-zinc-300 font-medium mb-1.5 text-[11px] truncate">
                  Highlight Action
                </label>
                <select
                  value={style.highlightAnimation}
                  onChange={(e) =>
                    update({
                      highlightAnimation: e.target.value as HighlightAnimation,
                    })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg p-2 focus:border-amber-400 focus:outline-none text-xs truncate"
                >
                  <option value="pop">Scale Zoom Pop</option>
                  <option value="glow">Neon Glow Flash</option>
                  <option value="background">Active Word Badge Pill</option>
                  <option value="color-change">Color Accent Only (Flat)</option>
                  <option value="underline">Accent Underline</option>
                  <option value="none">None (Static)</option>
                </select>
              </div>
            </div>

            {/* Active Word Zoom / Scale Slider (Text Zoom Settings) */}
            <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2">
              <div className="flex justify-between items-center text-zinc-300">
                <label className="font-semibold text-[11px] flex items-center gap-1.5 text-zinc-200">
                  <ZoomIn className="w-3.5 h-3.5 text-amber-400" />
                  Active Word Zoom (Scale)
                </label>
                <span className="font-mono text-amber-400 font-bold text-[11px]">
                  {(style.zoomScale ?? 1.15).toFixed(2)}x
                  {(style.zoomScale ?? 1.15) === 1.0 ? ' (No Zoom / Flat)' : ''}
                </span>
              </div>
              <input
                type="range"
                min="1.00"
                max="1.35"
                step="0.01"
                value={style.zoomScale ?? 1.15}
                onChange={(e) => update({ zoomScale: Number(e.target.value) })}
                className="w-full accent-amber-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                <span>1.0x (Flat / Normal)</span>
                <span>1.15x (Balanced)</span>
                <span>1.35x (Max Zoom)</span>
              </div>
              {(style.highlightAnimation === 'color-change' || style.highlightAnimation === 'none') ? (
                <div className="text-[10px] text-amber-300/90 bg-amber-950/30 border border-amber-500/20 px-2 py-1.5 rounded-lg flex items-center gap-1.5">
                  <span>Normal text mode: text is strictly flat at 1.0x to prevent any overlapping.</span>
                </div>
              ) : (
                <div className="text-[10px] text-zinc-400 bg-zinc-900/50 px-2 py-1 rounded border border-zinc-800/60">
                  Dynamic layout margin buffering automatically separates adjacent words when zoomed.
                </div>
              )}
            </div>

            {/* Text Stroke / Outline Width */}
            <div>
              <div className="flex justify-between items-center mb-1 text-zinc-300">
                <label className="font-medium">Text Stroke / Outline</label>
                <span className="font-mono text-zinc-400">{style.strokeWidth}px</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="12"
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

            {/* Text Effect Selector (Drop Shadow, Neon Glow, Retro 3D, Soft Ambient) */}
            <div>
              <label className="block text-zinc-300 font-medium mb-1.5 flex items-center gap-1">
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                Text Glow & Shadow Filter
              </label>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {(
                  [
                    { id: 'none', label: 'No Filter' },
                    { id: 'drop-shadow', label: 'Drop Shadow' },
                    { id: 'neon-glow', label: 'Neon Glow' },
                    { id: 'retro-3d', label: 'Retro 3D' },
                    { id: 'soft-ambient', label: 'Ambient Soft' },
                  ] as const
                ).map((eff) => (
                  <button
                    key={eff.id}
                    type="button"
                    onClick={() => update({ textEffect: eff.id as TextEffectType })}
                    className={`py-1.5 px-2 rounded-lg border text-center font-medium transition-all cursor-pointer ${
                      (style.textEffect || 'none') === eff.id
                        ? 'bg-amber-500 text-black border-amber-400 font-semibold'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {eff.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Shadow & Glow Customization */}
            {((style.textEffect || 'none') !== 'none') && (
              <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-zinc-300 font-medium">Glow / Shadow Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={style.glowColor || style.shadowColor || '#000000'}
                      onChange={(e) => update({ shadowColor: e.target.value, glowColor: e.target.value })}
                      className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent"
                    />
                    <span className="font-mono text-zinc-400 text-[10px]">
                      {style.glowColor || style.shadowColor || '#000000'}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1 text-zinc-300">
                    <label className="text-[11px]">Blur / Aura Radius</label>
                    <span className="font-mono text-amber-400">{style.shadowBlur || 8}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="28"
                    step="1"
                    value={style.shadowBlur || 8}
                    onChange={(e) => update({ shadowBlur: Number(e.target.value) })}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>

                {style.textEffect === 'retro-3d' && (
                  <div>
                    <div className="flex justify-between items-center mb-1 text-zinc-300">
                      <label className="text-[11px]">3D Offset Distance</label>
                      <span className="font-mono text-amber-400">{style.shadowOffsetX ?? 5}px</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="14"
                      step="1"
                      value={style.shadowOffsetX ?? 5}
                      onChange={(e) => update({ shadowOffsetX: Number(e.target.value), shadowOffsetY: Number(e.target.value) })}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: BACKGROUND BANNER & PILL BADGE (Instagram & VN Style Boxes)        */}
        {/* ========================================================================= */}
        {activeTab === 'background' && (
          <div className="space-y-4">
            <div>
              <label className="block text-zinc-300 font-medium mb-1.5 flex items-center gap-1.5">
                <Square className="w-3.5 h-3.5 text-amber-400" />
                Background Badge Style (Instagram / VN)
              </label>
              <div className="grid grid-cols-3 gap-1.5 mb-3">
                {(
                  [
                    { id: 'none', label: 'None' },
                    { id: 'solid-pill', label: 'Solid Pill' },
                    { id: 'frosted-glass', label: 'Frosted Glass' },
                    { id: 'marker-bar', label: 'Highlighter' },
                    { id: 'outline-pill', label: 'Outline Box' },
                  ] as const
                ).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => update({ backgroundStyle: b.id as BackgroundStyle })}
                    className={`py-1.5 px-2 rounded-lg border text-center font-medium transition-all cursor-pointer ${
                      (style.backgroundStyle || 'none') === b.id
                        ? 'bg-amber-500 text-black border-amber-400 font-semibold'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {style.backgroundStyle && style.backgroundStyle !== 'none' && (
              <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-zinc-300 font-medium">Box Tint Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={style.backgroundColor || '#000000'}
                      onChange={(e) => update({ backgroundColor: e.target.value })}
                      className="w-7 h-7 rounded border-0 cursor-pointer bg-transparent"
                    />
                    <span className="font-mono text-zinc-300 uppercase">
                      {style.backgroundColor || '#000000'}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1 text-zinc-300">
                    <label className="text-[11px]">Background Opacity</label>
                    <span className="font-mono text-amber-400">
                      {Math.round((style.backgroundOpacity ?? 0.8) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={style.backgroundOpacity ?? 0.8}
                    onChange={(e) => update({ backgroundOpacity: Number(e.target.value) })}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1 text-zinc-300">
                    <label className="text-[11px]">Corner Roundness (Radius)</label>
                    <span className="font-mono text-amber-400">
                      {(style.backgroundRadius ?? 16) >= 50 ? 'Full Pill' : `${style.backgroundRadius ?? 16}px`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="2"
                    value={Math.min(50, style.backgroundRadius ?? 16)}
                    onChange={(e) => update({ backgroundRadius: Number(e.target.value) === 50 ? 999 : Number(e.target.value) })}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1 text-zinc-300">
                    <label className="text-[11px]">Internal Padding</label>
                    <span className="font-mono text-amber-400">{style.backgroundPadding ?? 14}px</span>
                  </div>
                  <input
                    type="range"
                    min="6"
                    max="28"
                    step="2"
                    value={style.backgroundPadding ?? 14}
                    onChange={(e) => update({ backgroundPadding: Number(e.target.value) })}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Karaoke Active Word Pill Color */}
            <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-zinc-200">Active Word Highlight Pill</p>
                  <p className="text-[10px] text-zinc-500">Dedicated background tag for spoken word (VN Karaoke)</p>
                </div>
                <input
                  type="color"
                  value={style.activeWordBgColor || style.importantColor}
                  onChange={(e) => update({ activeWordBgColor: e.target.value })}
                  className="w-7 h-7 rounded border-0 cursor-pointer bg-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: POSITION, ALIGNMENT & SAFE AREA GUIDES                              */}
        {/* ========================================================================= */}
        {activeTab === 'layout' && (
          <div className="space-y-4">
            {/* Text Alignment */}
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
                    onClick={() =>
                      update({
                        textAlign: id as TextAlignment,
                        customX: id === 'custom' ? (style.customX ?? 50) : style.customX,
                      })
                    }
                    className={`py-1.5 rounded-lg border text-center font-medium flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      style.textAlign === id
                        ? 'bg-amber-500 text-black border-amber-400 font-semibold'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="text-[11px]">{label}</span>
                  </button>
                ))}
              </div>

              {style.textAlign === 'custom' && (
                <div className="mt-2.5 p-2.5 bg-zinc-950 rounded-lg border border-zinc-800 space-y-2">
                  <div className="flex justify-between items-center text-zinc-400 text-[11px]">
                    <span>Horizontal Position (X%)</span>
                    <span className="font-mono text-amber-400">{style.customX ?? 50}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    step="1"
                    value={style.customX ?? 50}
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

            {/* Position (Top, Center, Bottom, Custom) */}
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
                    onClick={() =>
                      update({
                        position: pos.id as CaptionPosition,
                        customY: pos.id === 'custom' ? (style.customY ?? 20) : style.customY,
                      })
                    }
                    className={`py-1.5 rounded-lg border text-center font-medium transition-all cursor-pointer ${
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
                    <span className="font-mono text-amber-400">{style.customY ?? 20}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    step="1"
                    value={style.customY ?? 20}
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
        )}
      </div>
    </div>
  );
};
