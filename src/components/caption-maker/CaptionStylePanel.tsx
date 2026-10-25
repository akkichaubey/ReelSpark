'use client';

import React, { useState, useEffect } from 'react';
import {
  CaptionStyle,
  CaptionMode,
  AnimationPreset,
  HighlightAnimation,
  CaptionPosition,
  Caption9Position,
  FontWeight,
  TextAlignment,
  TextTransformMode,
  BackgroundStyle,
  TextEffectType,
} from '@/lib/caption-maker/types';
import { resolveNinePosition } from '@/lib/caption-maker/text-transform';
import {
  REEL_STYLE_PRESETS,
  PRESET_CLEANUP_DEFAULTS,
} from '@/lib/caption-maker/sample-data';
import {
  Type,
  Palette,
  Sparkles,
  Layout,
  AlignLeft,
  AlignCenter,
  AlignRight,
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
  BookmarkPlus,
  BookmarkCheck,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import {
  POPULAR_GOOGLE_FONTS,
  loadGoogleFontInDocument,
  loadFontBatch,
} from '@/lib/caption-maker/google-fonts';
import {
  getCustomPresets,
  saveCustomPreset,
  deleteCustomPreset,
  CustomStylePreset,
} from '@/lib/caption-maker/custom-presets';

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

  // Custom User Style Presets state
  const [customPresets, setCustomPresets] = useState<CustomStylePreset[]>([]);
  const [isSavingPreset, setIsSavingPreset] = useState<boolean>(false);
  const [presetNameInput, setPresetNameInput] = useState<string>('');
  const [presetDescInput, setPresetDescInput] = useState<string>('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string>('');

  useEffect(() => {
    setCustomPresets(getCustomPresets());
  }, []);

  const handleSavePreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetNameInput.trim()) return;
    const created = saveCustomPreset(presetNameInput.trim(), style, presetDescInput.trim());
    setCustomPresets(getCustomPresets());
    setPresetNameInput('');
    setPresetDescInput('');
    setIsSavingPreset(false);
    setSaveSuccessMsg(`Saved style "${created.name}"`);
    setTimeout(() => setSaveSuccessMsg(''), 3000);
  };

  const handleDeletePreset = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = deleteCustomPreset(id);
    setCustomPresets(updated);
  };

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

  const applyPreset = (presetStyle: Partial<CaptionStyle>, presetId?: string) => {
    if (presetStyle.fontFamily) {
      loadGoogleFontInDocument(presetStyle.fontFamily);
    }
    onChangeStyle({
      ...style,
      ...PRESET_CLEANUP_DEFAULTS,
      ...presetStyle,
      ...(presetId ? { presetId } : {}),
    });
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
      {/* Header */}
      <div className="p-3.5 bg-zinc-950/70 border-b border-zinc-800 flex items-center justify-between shrink-0">
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
      <div className="flex items-center border-b border-zinc-800 bg-zinc-950/50 p-1 text-[11px] shrink-0 overflow-x-auto">
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

      <div role="region" aria-label="Caption style options" tabIndex={0} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-5 custom-scrollbar text-xs">
        {/* ========================================================================= */}
        {/* TAB 1: 1-CLICK VIRAL PRESETS (VN / Instagram / CapCut templates)          */}
        {/* ========================================================================= */}
        {activeTab === 'presets' && (
          <div className="space-y-4">
            {/* Custom Brand Style Saver Card */}
            <div className="p-3 bg-gradient-to-r from-amber-500/10 via-zinc-900 to-zinc-950 border border-amber-500/30 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-400 text-black font-bold">
                    <BookmarkPlus className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-zinc-100 text-xs">Save As My Style</h4>
                    <p className="text-[10px] text-zinc-400">Reuse the complete visual recipe: type, motion, badges, anchor and safe zone.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSavingPreset(!isSavingPreset)}
                  className="px-2.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-amber-400/20"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  <span>{isSavingPreset ? 'Close' : 'Save Style'}</span>
                </button>
              </div>

              {saveSuccessMsg && (
                <div className="flex items-center gap-1.5 text-[11px] text-green-400 font-semibold bg-green-500/10 border border-green-500/30 px-2.5 py-1.5 rounded-lg animate-in fade-in">
                  <BookmarkCheck className="w-3.5 h-3.5" />
                  <span>{saveSuccessMsg}</span>
                </div>
              )}

              {isSavingPreset && (
                <form onSubmit={handleSavePreset} className="pt-2 border-t border-zinc-800 space-y-2 animate-in fade-in">
                  <div>
                    <label className="block text-[10px] font-semibold text-zinc-300 mb-1">
                      Preset Name <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={presetNameInput}
                      onChange={(e) => setPresetNameInput(e.target.value)}
                      placeholder="e.g. My Podcast Gold, Dark Minimal, Neon Brand..."
                      className="w-full bg-zinc-950 border border-zinc-700 focus:border-amber-400 text-zinc-100 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                      autoFocus
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-zinc-400 mb-1">
                      Description / Tags (Optional)
                    </label>
                    <input
                      type="text"
                      value={presetDescInput}
                      onChange={(e) => setPresetDescInput(e.target.value)}
                      placeholder="e.g. Yellow glow, Montserrat bold, for motivational reels"
                      className="w-full bg-zinc-950 border border-zinc-700 focus:border-amber-400 text-zinc-100 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsSavingPreset(false)}
                      className="px-2.5 py-1 text-zinc-400 hover:text-zinc-200 text-[11px] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!presetNameInput.trim()}
                      className="px-3 py-1.5 bg-amber-400 disabled:opacity-50 hover:bg-amber-300 text-black font-bold text-xs rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <BookmarkCheck className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Save Preset</span>
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* My Saved Styles Section (if user has custom presets) */}
            {customPresets.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-zinc-200 font-semibold flex items-center gap-1.5">
                    <BookmarkCheck className="w-3.5 h-3.5 text-amber-400" />
                    My Saved Brand Styles
                  </label>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-amber-300 border border-zinc-700">
                    {customPresets.length} saved
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {customPresets.map((preset) => {
                    const isCustomActive =
                      style.fontFamily === preset.style.fontFamily &&
                      style.textColor === preset.style.textColor &&
                      style.importantColor === preset.style.importantColor &&
                      style.strokeWidth === preset.style.strokeWidth;

                    return (
                      <div
                        key={preset.id}
                        onClick={() => applyPreset(preset.style, preset.id)}
                        className={`group relative p-2.5 rounded-xl border text-left flex flex-col justify-between cursor-pointer transition-all ${
                          isCustomActive
                            ? 'border-amber-400 bg-zinc-900/90 shadow-md shadow-amber-400/20 ring-1 ring-amber-400'
                            : 'border-zinc-800 bg-zinc-950/70 hover:border-amber-400/60 hover:bg-zinc-900/80 shadow-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span
                            className={`font-semibold text-[11px] truncate pr-1 ${
                              isCustomActive ? 'text-amber-300 font-bold' : 'text-zinc-100 group-hover:text-amber-300'
                            }`}
                          >
                            {preset.name}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              {preset.badge || 'BRAND'}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleDeletePreset(e, preset.id)}
                              title="Delete preset"
                              className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Live custom mini-preview */}
                        <div
                          style={{
                            backgroundColor: preset.style.backgroundColor || '#09090b',
                            color: preset.style.textColor || '#FFFFFF',
                            fontFamily: preset.style.fontFamily,
                            border: `1px solid ${
                              preset.style.importantColor ? preset.style.importantColor + '40' : 'rgba(255,255,255,0.1)'
                            }`,
                          }}
                          className="mt-1 py-1 px-2 rounded-md text-center font-bold text-[10px] tracking-wide truncate shadow-inner"
                        >
                          MY <span style={{ color: preset.style.importantColor || '#FCD905' }}>STYLE</span>
                        </div>

                        <span className="text-[10px] text-zinc-500 mt-1.5 line-clamp-1 leading-tight">
                          {preset.description}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
                    style.presetId === preset.id ||
                    (!style.presetId &&
                      ((preset.id === 'cinematic-subtitle' &&
                        style.fontFamily?.includes('Montserrat') &&
                        style.animationPreset === 'clean') ||
                      (style.fontFamily === preset.style.fontFamily &&
                        style.animationPreset === preset.style.animationPreset &&
                        style.strokeWidth === preset.style.strokeWidth &&
                        style.textEffect === preset.style.textEffect)));

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.style, preset.id)}
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

            {/* Quick Active & Primary Colors Customizer for Selected Preset */}
            <div className="p-3.5 bg-zinc-950/90 border border-zinc-800/90 rounded-2xl space-y-3.5 shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400 shadow-sm">
                    <Palette className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-zinc-100 tracking-tight">
                      Active &amp; Primary Colors
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const activePreset = REEL_STYLE_PRESETS.find((p) => p.id === style.presetId);
                    update({
                      importantColor: activePreset?.style.importantColor || '#FCD905',
                      textColor: activePreset?.style.textColor || '#FFFFFF',
                      activeWordBgColor: activePreset?.style.activeWordBgColor,
                      glowColor:
                        style.textEffect === 'neon-glow'
                          ? activePreset?.style.glowColor || activePreset?.style.importantColor || '#FCD905'
                          : style.glowColor,
                    });
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-amber-300 border border-zinc-800 hover:border-zinc-700 text-[10px] font-semibold transition-all cursor-pointer shadow-sm active:scale-95"
                  title="Reset colors back to preset defaults"
                >
                  <RotateCcw className="w-3 h-3 text-amber-400" />
                  <span>Reset to Default</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* 1. Active Spoken Word Color */}
                <div className="p-3 bg-zinc-900/70 border border-zinc-800/90 hover:border-zinc-700/80 rounded-xl space-y-2.5 transition-all shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shadow-sm" />
                    <span className="text-xs font-bold text-amber-400">
                      Active Spoken Word
                    </span>
                  </div>

                  {/* Color Swatch Tile + Integrated Hex Input */}
                  <div className="flex items-center gap-2">
                    <div
                      className="relative w-8 h-8 rounded-lg border border-white/20 shadow-md shrink-0 cursor-pointer overflow-hidden transition-transform hover:scale-105 active:scale-95 ring-1 ring-black/40"
                      style={{ backgroundColor: style.importantColor || '#FCD905' }}
                      title="Click to open color picker"
                    >
                      <input
                        type="color"
                        value={
                          style.importantColor?.startsWith('#') && style.importantColor.length === 7
                            ? style.importantColor
                            : '#FCD905'
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          update({
                            importantColor: val,
                            glowColor: style.textEffect === 'neon-glow' ? val : style.glowColor,
                            activeWordBgColor: style.activeWordBgColor ? val : undefined,
                          });
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                    </div>
                    <div className="relative flex-1 flex items-center bg-zinc-950 border border-zinc-700/80 rounded-lg px-2.5 h-8 focus-within:border-amber-400 focus-within:ring-1 focus-within:ring-amber-400/20 transition-all">
                      <span className="text-zinc-500 font-mono text-xs select-none mr-1 font-bold">#</span>
                      <input
                        type="text"
                        value={style.importantColor ? style.importantColor.replace(/^#/, '') : 'FCD905'}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6);
                          const val = `#${raw}`;
                          update({
                            importantColor: val,
                            glowColor: style.textEffect === 'neon-glow' ? val : style.glowColor,
                            activeWordBgColor: style.activeWordBgColor ? val : undefined,
                          });
                        }}
                        maxLength={6}
                        placeholder="FCD905"
                        className="w-full bg-transparent font-mono text-xs text-amber-300 font-bold focus:outline-none uppercase tracking-wider"
                      />
                    </div>
                  </div>

                  {/* Symmetrical Quick Color Swatches (8 dots) */}
                  <div className="flex items-center justify-between pt-1">
                    {[
                      { col: '#FCD905', title: 'Viral Gold (Default)' },
                      { col: '#00F2FE', title: 'Neon Cyan' },
                      { col: '#A3E635', title: 'Neon Lime' },
                      { col: '#FF007A', title: 'Hot Pink' },
                      { col: '#FF6B00', title: 'Flame Orange' },
                      { col: '#C084FC', title: 'Purple' },
                      { col: '#EF4444', title: 'Alert Red' },
                      { col: '#FFFFFF', title: 'Pure White' },
                    ].map((s) => {
                      const isSelected = style.importantColor?.toUpperCase() === s.col.toUpperCase();
                      return (
                        <button
                          key={s.col}
                          type="button"
                          onClick={() => {
                            update({
                              importantColor: s.col,
                              glowColor: style.textEffect === 'neon-glow' ? s.col : style.glowColor,
                              activeWordBgColor: style.activeWordBgColor ? s.col : undefined,
                            });
                          }}
                          style={{ backgroundColor: s.col }}
                          title={s.title}
                          className={`w-5 h-5 rounded-full cursor-pointer transition-all hover:scale-125 border ${
                            isSelected
                              ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-zinc-900 border-white scale-110 shadow-lg'
                              : 'border-zinc-700/80 hover:border-zinc-400'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* 2. Primary / Normal Text Color */}
                <div className="p-3 bg-zinc-900/70 border border-zinc-800/90 hover:border-zinc-700/80 rounded-xl space-y-2.5 transition-all shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-white shadow-sm" />
                    <span className="text-xs font-bold text-zinc-200">
                      Primary Text
                    </span>
                  </div>

                  {/* Color Swatch Tile + Integrated Hex Input */}
                  <div className="flex items-center gap-2">
                    <div
                      className="relative w-8 h-8 rounded-lg border border-white/20 shadow-md shrink-0 cursor-pointer overflow-hidden transition-transform hover:scale-105 active:scale-95 ring-1 ring-black/40"
                      style={{ backgroundColor: style.textColor || '#FFFFFF' }}
                      title="Click to open color picker"
                    >
                      <input
                        type="color"
                        value={
                          style.textColor?.startsWith('#') && style.textColor.length === 7
                            ? style.textColor
                            : '#FFFFFF'
                        }
                        onChange={(e) => update({ textColor: e.target.value })}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                    </div>
                    <div className="relative flex-1 flex items-center bg-zinc-950 border border-zinc-700/80 rounded-lg px-2.5 h-8 focus-within:border-amber-400 focus-within:ring-1 focus-within:ring-amber-400/20 transition-all">
                      <span className="text-zinc-500 font-mono text-xs select-none mr-1 font-bold">#</span>
                      <input
                        type="text"
                        value={style.textColor ? style.textColor.replace(/^#/, '') : 'FFFFFF'}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6);
                          update({ textColor: `#${raw}` });
                        }}
                        maxLength={6}
                        placeholder="FFFFFF"
                        className="w-full bg-transparent font-mono text-xs text-zinc-100 font-bold focus:outline-none uppercase tracking-wider"
                      />
                    </div>
                  </div>

                  {/* Symmetrical Quick Color Swatches (8 dots matching active card) */}
                  <div className="flex items-center justify-between pt-1">
                    {[
                      { col: '#FFFFFF', title: 'Pure White (Default)' },
                      { col: '#FFFBEB', title: 'Warm Cream' },
                      { col: '#E2E8F0', title: 'Silver Slate' },
                      { col: '#D1D5DB', title: 'Soft Gray' },
                      { col: '#93C5FD', title: 'Ice Blue' },
                      { col: '#FEF08A', title: 'Pale Gold' },
                      { col: '#FDF6E2', title: 'Retro Beige' },
                      { col: '#18181B', title: 'Deep Black' },
                    ].map((s) => {
                      const isSelected = style.textColor?.toUpperCase() === s.col.toUpperCase();
                      return (
                        <button
                          key={s.col}
                          type="button"
                          onClick={() => update({ textColor: s.col })}
                          style={{ backgroundColor: s.col }}
                          title={s.title}
                          className={`w-5 h-5 rounded-full cursor-pointer transition-all hover:scale-125 border ${
                            isSelected
                              ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-zinc-900 border-white scale-110 shadow-lg'
                              : 'border-zinc-700/80 hover:border-zinc-400'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
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
                        activeWordBgColor: style.activeWordBgColor ? '#FCD905' : undefined,
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
                    onChange={(e) => {
                      const val = e.target.value;
                      update({
                        importantColor: val,
                        activeWordBgColor: style.activeWordBgColor ? val : undefined,
                        glowColor: style.textEffect === 'neon-glow' ? val : style.glowColor,
                      });
                    }}
                    className="w-7 h-7 rounded border-0 cursor-pointer bg-transparent shrink-0"
                    title="Choose active spoken word color"
                  />
                  <input
                    type="text"
                    value={style.importantColor}
                    onChange={(e) => {
                      const val = e.target.value;
                      update({
                        importantColor: val,
                        activeWordBgColor: style.activeWordBgColor ? val : undefined,
                        glowColor: style.textEffect === 'neon-glow' ? val : style.glowColor,
                      });
                    }}
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
                          activeWordBgColor: style.activeWordBgColor ? s.col : undefined,
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

            {/* Text Case Transformation Studio */}
            <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-semibold text-zinc-200 text-xs block">
                    Text Case Transformation
                  </label>
                  <span className="text-[10px] text-zinc-500 block">
                    Convert spoken subtitle casing across all captions
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 uppercase font-bold">
                  {style.textTransform || (style.uppercase ? 'uppercase' : 'none')}
                </span>
              </div>

              {/* 4 Primary Transformation Mode Cards */}
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  {
                    id: 'uppercase',
                    label: 'UPPERCASE',
                    desc: 'ALL CAPS (Viral standard)',
                    preview: 'TRANSFORM YOUR REEL',
                    setUppercase: true,
                  },
                  {
                    id: 'sentence',
                    label: 'Sentence case',
                    desc: 'First letter capitalized',
                    preview: 'Transform your reel',
                    setUppercase: false,
                  },
                  {
                    id: 'lowercase',
                    label: 'lowercase',
                    desc: 'All small letters',
                    preview: 'transform your reel',
                    setUppercase: false,
                  },
                  {
                    id: 'title',
                    label: 'Title Case',
                    desc: 'Capitalize Each Word',
                    preview: 'Transform Your Reel',
                    setUppercase: false,
                  },
                ].map((item) => {
                  const currentMode = style.textTransform || (style.uppercase ? 'uppercase' : 'none');
                  const isSelected = currentMode === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        update({
                          textTransform: item.id as TextTransformMode,
                          uppercase: item.setUppercase,
                        })
                      }
                      className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/20 border-amber-500 text-white ring-1 ring-amber-500/40'
                          : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[11px] block">{item.label}</span>
                        {isSelected && <span className="text-amber-400 font-bold text-xs">✓</span>}
                      </div>
                      <span className="text-[9px] text-zinc-500 line-clamp-1 mt-0.5">{item.desc}</span>
                      <span className="text-[9px] font-mono text-amber-300/80 bg-zinc-950/60 px-1 py-0.5 rounded mt-1 truncate">
                        {item.preview}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Original / As-Spoken Option */}
              <button
                type="button"
                onClick={() =>
                  update({
                    textTransform: 'none',
                    uppercase: false,
                  })
                }
                className={`w-full py-1.5 px-2.5 rounded-lg border text-left flex items-center justify-between transition-all cursor-pointer ${
                  (style.textTransform === 'none' || (!style.textTransform && !style.uppercase))
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 ring-1 ring-amber-500/30'
                    : 'bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div>
                  <span className="font-semibold text-[11px] block">As Spoken (Original Transcript)</span>
                  <span className="text-[9px] text-zinc-500">Preserve verbatim casing as transcribed</span>
                </div>
                {(style.textTransform === 'none' || (!style.textTransform && !style.uppercase)) && (
                  <span className="text-amber-400 font-bold text-xs">✓</span>
                )}
              </button>
            </div>
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

            {/* Auto Animated Emojis on Key Words (CapCut / Submagic Viral Style) */}
            <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-lg">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-zinc-200 font-semibold text-xs">
                    <span>🔥</span>
                    <span>Auto Viral Emojis</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 font-mono">
                      Submagic style
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500">
                    Bouncing animated emojis on key words (💰, 🔥, 🎯, 🚀, 💡, 🏆)
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={style.showEmojis !== false}
                  onChange={(e) => update({ showEmojis: e.target.checked })}
                  className="w-4 h-4 accent-amber-400 rounded cursor-pointer shrink-0"
                />
              </label>
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
            {/* 1. Interactive 9-Position Visual Pad (3x3 Reel Canvas Anchors) */}
            <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-semibold text-zinc-200 text-xs block flex items-center gap-1.5">
                    <Layout className="w-3.5 h-3.5 text-amber-400" />
                    9-Position Canvas Anchor Pad
                  </label>
                  <span className="text-[10px] text-zinc-500 block">
                    1-Click Instagram & TikTok screen positioning
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 uppercase font-bold">
                  {resolveNinePosition(style.position, style.textAlign)}
                </span>
              </div>

              {/* 3x3 Visual Interactive Grid */}
              <div className="p-2.5 bg-black/60 rounded-xl border border-zinc-800/80 grid grid-cols-3 gap-1.5 max-w-[280px] mx-auto">
                {(
                  [
                    { id: 'top-left', label: 'Top Left', pos: 'top', align: 'left', shortcut: 'TL' },
                    { id: 'top-center', label: 'Top Center', pos: 'top', align: 'center', shortcut: 'TC' },
                    { id: 'top-right', label: 'Top Right', pos: 'top', align: 'right', shortcut: 'TR' },
                    { id: 'center-left', label: 'Center Left', pos: 'center', align: 'left', shortcut: 'CL' },
                    { id: 'center', label: 'Center', pos: 'center', align: 'center', shortcut: 'CC' },
                    { id: 'center-right', label: 'Center Right', pos: 'center', align: 'right', shortcut: 'CR' },
                    { id: 'bottom-left', label: 'Bottom Left', pos: 'bottom', align: 'left', shortcut: 'BL' },
                    { id: 'bottom-center', label: 'Bottom Center', pos: 'bottom', align: 'center', shortcut: 'BC' },
                    { id: 'bottom-right', label: 'Bottom Right', pos: 'bottom', align: 'right', shortcut: 'BR' },
                  ] as const
                ).map((cell) => {
                  const currentNine = resolveNinePosition(style.position, style.textAlign);
                  const isCurrent = currentNine === cell.id && style.position !== 'custom';
                  return (
                    <button
                      key={cell.id}
                      type="button"
                      onClick={() =>
                        update({
                          position: cell.id as CaptionPosition,
                          ninePosition: cell.id as Caption9Position,
                          textAlign: cell.align as TextAlignment,
                        })
                      }
                      title={cell.label}
                      className={`h-11 rounded-lg border flex flex-col items-center justify-center transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-md shadow-amber-400/20 scale-[1.02]'
                          : 'bg-zinc-900/70 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white hover:bg-zinc-800/60'
                      }`}
                    >
                      <span className="text-[10px] font-mono font-bold leading-none">{cell.shortcut}</span>
                      <span className="text-[8px] opacity-75 mt-0.5 leading-none">{cell.label.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Horizontal Alignment & Vertical Anchor Selectors */}
            <div className="grid grid-cols-2 gap-3">
              {/* Horizontal Alignment */}
              <div>
                <label className="block text-zinc-300 font-medium mb-1 text-[11px]">Horizontal Align</label>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: 'left', icon: AlignLeft, label: 'L' },
                      { id: 'center', icon: AlignCenter, label: 'C' },
                      { id: 'right', icon: AlignRight, label: 'R' },
                    ] as const
                  ).map(({ id, icon: Icon, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => update({ textAlign: id as TextAlignment })}
                      className={`py-1.5 rounded-lg border text-center font-medium flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        style.textAlign === id
                          ? 'bg-amber-500 text-black border-amber-400 font-bold'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                      title={`Align ${id}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="text-[10px]">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Vertical Anchor */}
              <div>
                <label className="block text-zinc-300 font-medium mb-1 text-[11px]">Vertical Anchor</label>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: 'top', label: 'Top' },
                      { id: 'center', label: 'Mid' },
                      { id: 'bottom', label: 'Bot' },
                    ] as const
                  ).map((pos) => (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => update({ position: pos.id as CaptionPosition })}
                      className={`py-1.5 rounded-lg border text-center font-medium transition-all cursor-pointer text-[10px] ${
                        (style.position === pos.id || style.position.startsWith(pos.id)) && style.position !== 'custom'
                          ? 'bg-amber-500 text-black border-amber-400 font-bold'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Custom Freeform Coordinate Sliders (X% & Y%) */}
            <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-zinc-200 text-xs block">
                    Custom Coordinates (Free Drag)
                  </span>
                  <span className="text-[10px] text-zinc-500 block">
                    Fine-tune exact percentage placement on canvas
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    update({
                      position: 'custom',
                      textAlign: 'custom',
                      customX: style.customX ?? 50,
                      customY: style.customY ?? 50,
                    })
                  }
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
                    style.position === 'custom' || style.textAlign === 'custom'
                      ? 'bg-amber-400 text-black border-amber-300 font-bold'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {style.position === 'custom' ? 'Active' : 'Enable Freeform'}
                </button>
              </div>

              {/* Horizontal Slider (X%) */}
              <div>
                <div className="flex justify-between items-center mb-1 text-zinc-300 text-[11px]">
                  <span>Horizontal (X%)</span>
                  <span className="font-mono text-amber-400 font-bold">{style.customX ?? 50}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="90"
                  step="1"
                  value={style.customX ?? 50}
                  onChange={(e) =>
                    update({
                      customX: Number(e.target.value),
                      position: 'custom',
                      textAlign: 'custom',
                    })
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
                  <span>10% (Left Safe)</span>
                  <span>50% (Center)</span>
                  <span>84% (Right Safe)</span>
                </div>
              </div>

              {/* Vertical Slider (Y%) */}
              <div>
                <div className="flex justify-between items-center mb-1 text-zinc-300 text-[11px]">
                  <span>Vertical (Y%)</span>
                  <span className="font-mono text-amber-400 font-bold">{style.customY ?? 76}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="90"
                  step="1"
                  value={style.customY ?? 76}
                  onChange={(e) =>
                    update({
                      customY: Number(e.target.value),
                      position: 'custom',
                      textAlign: 'custom',
                    })
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
                  <span>14% (Top Safe)</span>
                  <span>50% (Center)</span>
                  <span>76% (Bottom Safe)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
