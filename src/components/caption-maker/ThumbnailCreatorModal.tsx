'use strict';
'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { CaptionProject, ImageAsset, ThumbnailSettings } from '@/lib/caption-maker/types';
import {
  THUMBNAIL_PRESETS,
  THUMBNAIL_GRADIENTS,
  QUICK_BADGES,
  createDefaultThumbnailSettings,
  renderThumbnailToCanvas,
  getThumbnailDimensions,
} from '@/lib/caption-maker/thumbnail-presets';
import {
  POPULAR_GOOGLE_FONTS,
  loadGoogleFontInDocument,
} from '@/lib/caption-maker/google-fonts';
import { SafeAreaOverlay } from './SafeAreaOverlay';
import { normalizeHookWord } from '@/lib/caption-maker/hook-quality';
import {
  X,
  Download,
  Image as ImageIcon,
  Sparkles,
  Type,
  Palette,
  Layout,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Check,
  RotateCcw,
  Upload,
  Tag,
  CheckCircle2,
  Tv,
  Layers,
  Wand2,
  SlidersHorizontal,
} from 'lucide-react';

interface ThumbnailCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: CaptionProject;
  onApplyAsProjectCover?: (imageAsset: ImageAsset) => void;
  onSaveThumbnailSettings?: (settings: ThumbnailSettings) => void;
}

export const ThumbnailCreatorModal: React.FC<ThumbnailCreatorModalProps> = ({
  isOpen,
  onClose,
  project,
  onApplyAsProjectCover,
  onSaveThumbnailSettings,
}) => {
  // Determine initial aspect ratio from outputSettings if available
  const initialAspect = useMemo(() => {
    const preset = project.outputSettings?.preset;
    if (preset === 'instagram-portrait') return '4:5';
    if (preset === 'instagram-square') return '1:1';
    if (preset === 'youtube-landscape') return '16:9';
    return '9:16';
  }, [project.outputSettings?.preset]);

  // Main Thumbnail Settings State
  const [settings, setSettings] = useState<ThumbnailSettings>(() => {
    return (
      project.thumbnailSettings ||
      createDefaultThumbnailSettings(project.title, initialAspect)
    );
  });

  // Active Control Tab
  const [activeTab, setActiveTab] = useState<'content' | 'presets' | 'typography' | 'layout'>('content');

  // Canvas Reference
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Background Media Elements
  const [bgImageEl, setBgImageEl] = useState<HTMLImageElement | null>(null);
  const [customBgDataUrl, setCustomBgDataUrl] = useState<string | null>(null);

  // Status notices
  const [appliedNotice, setAppliedNotice] = useState<boolean>(false);
  const [fontSearch, setFontSearch] = useState<string>('');
  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState<boolean>(false);

  // Extract punchy suggested titles from caption groups
  const suggestedTitles = useMemo(() => {
    const list: string[] = [];
    if (project.title && project.title !== 'Untitled Reel') {
      list.push(project.title);
    }
    // Take first few caption groups as hook ideas
    project.captionGroups.slice(0, 4).forEach((g) => {
      const phrase = g.words.map((w) => w.text).join(' ').trim();
      if (phrase.length > 8 && phrase.length < 50 && !list.includes(phrase)) {
        list.push(phrase);
      }
    });
    if (list.length === 0) {
      list.push('CREATE VIRAL REELS IN SECONDS', 'THE SECRET TO EXPLOSIVE GROWTH', 'STOP MAKING THESE MISTAKES');
    }
    return list;
  }, [project.title, project.captionGroups]);

  // Load project media image when modal opens or image URL changes
  useEffect(() => {
    if (!isOpen) return;

    const sourceUrl = customBgDataUrl || project.image?.fileUrl;
    if (sourceUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        setBgImageEl(img);
      };
      img.onerror = () => {
        setBgImageEl(null);
      };
      img.src = sourceUrl;
    } else {
      setBgImageEl(null);
    }
  }, [isOpen, project.image?.fileUrl, customBgDataUrl]);

  // Sync aspect ratio if outputSettings change and modal re-opens
  useEffect(() => {
    if (isOpen && !project.thumbnailSettings) {
      setSettings((prev) => ({
        ...prev,
        title: prev.title || createDefaultThumbnailSettings(project.title).title,
        aspectRatio: initialAspect,
      }));
    }
  }, [isOpen, initialAspect, project.title, project.thumbnailSettings]);

  // Load Google Font in document whenever fontFamily changes
  useEffect(() => {
    if (settings.fontFamily) {
      loadGoogleFontInDocument(settings.fontFamily, () => {
        triggerCanvasRedraw();
      });
    }
  }, [settings.fontFamily]);

  // Trigger canvas redraw
  const triggerCanvasRedraw = useCallback(() => {
    if (!canvasRef.current) return;
    renderThumbnailToCanvas(canvasRef.current, settings, bgImageEl);
  }, [settings, bgImageEl]);

  // Redraw canvas on any settings or image change
  useEffect(() => {
    if (!isOpen) return;
    triggerCanvasRedraw();
  }, [isOpen, settings, bgImageEl, triggerCanvasRedraw]);

  if (!isOpen) return null;

  // Words list in current title for click-to-highlight chips
  const titleWords = settings.title
    .split(/\s+/)
    .map((w) => w.trim().replace(/^[*]+|[*]+$/g, ''))
    .filter(Boolean);

  const toggleHighlightWord = (rawWord: string) => {
    const clean = normalizeHookWord(rawWord);
    if (!clean) return;

    setSettings((prev) => {
      const current = prev.highlightWords || [];
      const isAlready = current.includes(clean);
      const updated = isAlready
        ? current.filter((w) => w !== clean)
        : [...current, clean];

      return {
        ...prev,
        highlightWords: updated,
      };
    });
  };

  const applyPreset = (presetId: string) => {
    const found = THUMBNAIL_PRESETS.find((p) => p.id === presetId);
    if (!found) return;

    setSettings((prev) => ({
      ...prev,
      ...found.settings,
      preset: found.id,
      title: prev.title, // keep user's title
      subtitle: prev.subtitle,
      brandingText: prev.brandingText,
      aspectRatio: prev.aspectRatio,
      backgroundType: prev.backgroundType,
    }));
  };

  const handleDownload = (format: 'png' | 'jpeg') => {
    if (!canvasRef.current) return;
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    const dataUrl = canvasRef.current.toDataURL(mime, 0.95);

    const a = document.createElement('a');
    a.href = dataUrl;
    const cleanTitle = (settings.title || 'reel_thumbnail')
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase()
      .substring(0, 30);
    a.download = `${cleanTitle}_cover.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleApplyAsProjectCover = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png', 0.95);
    const { width, height } = getThumbnailDimensions(settings.aspectRatio);

    const newImageAsset: ImageAsset = {
      id: `thumb-${Date.now()}`,
      fileUrl: dataUrl,
      fileName: `${(settings.title || 'cover').substring(0, 20)}.png`,
      fileSize: Math.round(dataUrl.length * 0.75),
      width,
      height,
      format: 'png',
      fitMode: 'cover',
      mediaType: 'image',
    };

    onApplyAsProjectCover?.(newImageAsset);
    onSaveThumbnailSettings?.(settings);

    setAppliedNotice(true);
    setTimeout(() => {
      setAppliedNotice(false);
    }, 2500);
  };

  const handleCustomBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setCustomBgDataUrl(dataUrl);
        setSettings((prev) => ({
          ...prev,
          backgroundType: 'project',
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  const filteredFonts = POPULAR_GOOGLE_FONTS.filter((f) =>
    f.name.toLowerCase().includes(fontSearch.toLowerCase()) ||
    f.badge.toLowerCase().includes(fontSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-6xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Bar */}
        <div className="px-5 py-3.5 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center text-black font-black shadow-md shadow-amber-400/20">
              <Sparkles className="w-4 h-4 fill-black" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                Reel Cover & Thumbnail Creator
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  {settings.aspectRatio} • {getThumbnailDimensions(settings.aspectRatio).width}×{getThumbnailDimensions(settings.aspectRatio).height}
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Generate high-conversion viral hooks with customizable typography & layout
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onSaveThumbnailSettings?.(settings);
                onClose();
              }}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Studio Body: Split View (Canvas Left, Controls Right) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          {/* LEFT: Live Interactive Canvas Preview */}
          <div className="flex-1 bg-zinc-950/70 p-4 flex flex-col items-center justify-between border-b md:border-b-0 md:border-r border-zinc-800 overflow-y-auto">
            {/* Aspect Ratio Switcher Pills */}
            <div className="flex items-center gap-1.5 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800 mb-3 shadow-inner">
              {(['9:16', '4:5', '1:1', '16:9'] as const).map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => setSettings((prev) => ({ ...prev, aspectRatio: ratio }))}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    settings.aspectRatio === ratio
                      ? 'bg-amber-400 text-black shadow-sm font-bold'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  {ratio === '9:16' && '9:16 Reel'}
                  {ratio === '4:5' && '4:5 Feed'}
                  {ratio === '1:1' && '1:1 Square'}
                  {ratio === '16:9' && '16:9 Cover'}
                </button>
              ))}
            </div>

            {/* Canvas Viewport Container */}
            <div className="flex-1 flex items-center justify-center w-full min-h-0 relative my-auto">
              <div
                className="relative rounded-xl overflow-hidden shadow-2xl border border-zinc-700/60 bg-black flex items-center justify-center max-h-[58vh] max-w-full"
                style={{
                  aspectRatio:
                    settings.aspectRatio === '9:16'
                      ? '9 / 16'
                      : settings.aspectRatio === '4:5'
                      ? '4 / 5'
                      : settings.aspectRatio === '1:1'
                      ? '1 / 1'
                      : '16 / 9',
                }}
              >
                <canvas
                  ref={canvasRef}
                  className="w-full h-full object-contain block"
                />

                {/* Professional Social Safe Area & 1:1 Profile Crop Guides Overlay */}
                <SafeAreaOverlay
                  aspectRatio={settings.aspectRatio}
                  preset={settings.safeZoneOverrides?.platform}
                  mode="thumbnail"
                  showGuides={settings.showSafeArea === true}
                  customOverrides={settings.safeZoneOverrides}
                  onSelectPlatform={(p) => {
                    setSettings((prev) => ({
                      ...prev,
                      safeZoneOverrides: {
                        ...prev.safeZoneOverrides,
                        platform: p,
                        topDangerPercent: undefined,
                        bottomDangerPercent: undefined,
                        rightMarginPercent: undefined,
                        leftMarginPercent: undefined,
                      },
                    }));
                  }}
                />
              </div>
            </div>

            {/* Bottom Action Controls on Preview Pane */}
            <div className="w-full max-w-md flex flex-wrap items-center justify-center gap-2.5 mt-4 pt-3 border-t border-zinc-800/80">
              <button
                onClick={() => handleDownload('png')}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black font-bold rounded-xl text-xs shadow-lg shadow-amber-400/20 active:scale-95 transition-all"
              >
                <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Download PNG</span>
              </button>

              <button
                onClick={() => handleDownload('jpeg')}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold rounded-xl text-xs border border-zinc-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download JPEG</span>
              </button>

              {onApplyAsProjectCover && (
                <button
                  onClick={handleApplyAsProjectCover}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    appliedNotice
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-amber-300'
                  }`}
                >
                  {appliedNotice ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Set as Reel Image!</span>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                      <span>Set as Reel Image</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* RIGHT: Controls & Customization Panels */}
          <div className="w-full md:w-[460px] lg:w-[500px] flex flex-col bg-zinc-900 min-h-0 shrink-0">
            {/* Tabs Header */}
            <div className="flex border-b border-zinc-800 bg-zinc-950/70 p-1.5 gap-1 shrink-0">
              <button
                onClick={() => setActiveTab('content')}
                className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  activeTab === 'content'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Type className="w-3.5 h-3.5 text-amber-400" />
                Text & Hook
              </button>

              <button
                onClick={() => setActiveTab('presets')}
                className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  activeTab === 'presets'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                Presets
              </button>

              <button
                onClick={() => setActiveTab('typography')}
                className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  activeTab === 'typography'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Palette className="w-3.5 h-3.5 text-amber-400" />
                Style & Font
              </button>

              <button
                onClick={() => setActiveTab('layout')}
                className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  activeTab === 'layout'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Layout className="w-3.5 h-3.5 text-amber-400" />
                Layout & Bg
              </button>
            </div>

            {/* Scrollable Tab Content Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0 text-xs">
              {/* TAB 1: CONTENT & HOOK */}
              {activeTab === 'content' && (
                <div className="space-y-4">
                  {/* Title Input */}
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
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, title: e.target.value }))
                      }
                      placeholder="e.g. STOP MAKING THESE MISTAKES..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 font-bold text-sm focus:border-amber-400 focus:outline-none transition-colors"
                    />

                    {/* Quick Suggestions from project transcript */}
                    <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                      <span className="text-[10px] text-zinc-400">Quick Ideas:</span>
                      {suggestedTitles.map((phrase, i) => (
                        <button
                          key={i}
                          onClick={() =>
                            setSettings((prev) => ({ ...prev, title: phrase }))
                          }
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
                          Click word to highlight in yellow
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {titleWords.map((word, idx) => {
                          const clean = normalizeHookWord(word);
                          const isHl = (settings.highlightWords || []).includes(clean);
                          return (
                            <button
                              key={idx}
                              onClick={() => toggleHighlightWord(word)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                                isHl
                                  ? 'bg-[#FCD905] text-black border-[#FCD905] shadow-md shadow-amber-400/20'
                                  : 'bg-zinc-800/80 text-zinc-300 border-zinc-700 hover:border-zinc-500'
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
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, subtitle: e.target.value }))
                      }
                      placeholder="e.g. Masterclass with AI captions"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 text-xs focus:border-amber-400 focus:outline-none transition-colors"
                    />
                  </div>

                  {/* Viral Badge Pill with Enable Toggle & Full Customization */}
                  <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                    {/* Enable / Disable Toggle Header */}
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-850">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-amber-400" />
                        <div>
                          <label className="font-semibold text-zinc-100 text-xs block cursor-pointer select-none">
                            Hook Badge Pill
                          </label>
                          <span className="text-[10px] text-zinc-400 block">
                            {settings.badgeEnabled !== false ? 'Visible on thumbnail' : 'Disabled / hidden'}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.badgeEnabled !== false}
                        onClick={() =>
                          setSettings((prev) => ({
                            ...prev,
                            badgeEnabled: prev.badgeEnabled === false ? true : false,
                          }))
                        }
                        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                          settings.badgeEnabled !== false ? 'bg-amber-400' : 'bg-zinc-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-black shadow ring-0 transition duration-200 ease-in-out ${
                            settings.badgeEnabled !== false ? 'translate-x-5' : 'translate-x-0 bg-zinc-300'
                          }`}
                        />
                      </button>
                    </div>

                    {settings.badgeEnabled !== false && (
                      <>
                        {/* Spacing to Title Slider */}
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-semibold text-zinc-200">
                              Spacing to Title (Element Gap)
                            </label>
                            <span className="font-mono text-[10px] text-amber-300 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                              {settings.badgeSpacing ?? 24}px
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={2}
                            value={settings.badgeSpacing ?? 24}
                            onChange={(e) =>
                              setSettings((prev) => ({
                                ...prev,
                                badgeSpacing: Number(e.target.value),
                              }))
                            }
                            className="w-full accent-amber-400 cursor-pointer"
                          />
                          <div className="flex flex-wrap items-center gap-1">
                            {[
                              { label: 'Tight', val: 8 },
                              { label: 'Normal', val: 24 },
                              { label: 'Relaxed', val: 44 },
                              { label: 'Wide', val: 68 },
                            ].map((p) => (
                              <button
                                key={p.val}
                                type="button"
                                onClick={() =>
                                  setSettings((prev) => ({
                                    ...prev,
                                    badgeSpacing: p.val,
                                  }))
                                }
                                className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
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

                        {/* Badge Text Input */}
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] text-zinc-400 block">
                              Badge Text
                            </label>
                            {settings.badgeText && (
                              <button
                                onClick={() =>
                                  setSettings((prev) => ({ ...prev, badgeText: '' }))
                                }
                                className="text-[10px] text-red-400 hover:underline"
                              >
                                Clear text
                              </button>
                            )}
                          </div>

                          <input
                            type="text"
                            value={settings.badgeText || ''}
                            onChange={(e) =>
                              setSettings((prev) => ({ ...prev, badgeText: e.target.value }))
                            }
                            placeholder="e.g. MUST WATCH, PART 1, VIRAL"
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-100 text-xs focus:border-amber-400 focus:outline-none font-bold tracking-wider"
                          />

                          {/* Quick Badge Chips */}
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {QUICK_BADGES.map((badge) => (
                              <button
                                key={badge}
                                type="button"
                                onClick={() =>
                                  setSettings((prev) => ({ ...prev, badgeText: badge }))
                                }
                                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-all ${
                                  settings.badgeText === badge
                                    ? 'bg-amber-400 text-black border-amber-400 font-bold'
                                    : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500'
                                }`}
                              >
                                {badge}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Badge Style, Shape & Colors */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-850 text-xs">
                          <div>
                            <label className="text-[10px] text-zinc-400 mb-1 block">
                              Badge Style
                            </label>
                            <select
                              value={settings.badgeStyle || 'solid'}
                              onChange={(e) =>
                                setSettings((prev) => ({
                                  ...prev,
                                  badgeStyle: e.target.value as any,
                                }))
                              }
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-200 text-xs"
                            >
                              <option value="solid">Solid Fill</option>
                              <option value="glow">Neon Glow</option>
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
                              onChange={(e) =>
                                setSettings((prev) => ({
                                  ...prev,
                                  badgeShape: e.target.value as any,
                                }))
                              }
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-200 text-xs"
                            >
                              <option value="pill">Pill (Full Round)</option>
                              <option value="rounded">Rounded Card</option>
                              <option value="sharp">Sharp Rectangle</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] text-zinc-400 mb-1 block">
                              Background Color
                            </label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="color"
                                value={settings.badgeColor || '#FCD905'}
                                onChange={(e) =>
                                  setSettings((prev) => ({
                                    ...prev,
                                    badgeColor: e.target.value,
                                  }))
                                }
                                className="w-6 h-6 rounded border border-zinc-700 bg-transparent cursor-pointer"
                              />
                              <span className="font-mono text-[10px] text-zinc-300">
                                {settings.badgeColor || '#FCD905'}
                              </span>
                            </div>
                          </div>

                          <div>
                            <label className="text-[10px] text-zinc-400 mb-1 block">
                              Text Color
                            </label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="color"
                                value={settings.badgeTextColor || '#000000'}
                                onChange={(e) =>
                                  setSettings((prev) => ({
                                    ...prev,
                                    badgeTextColor: e.target.value,
                                    badgeAutoTextColor: false,
                                  }))
                                }
                                className="w-6 h-6 rounded border border-zinc-700 bg-transparent cursor-pointer"
                              />
                              <span className="font-mono text-[10px] text-zinc-300">
                                {settings.badgeTextColor || '#000000'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Watermark / Branding Text */}
                  <div>
                    <label className="font-semibold text-zinc-200 mb-1.5 block">
                      Creator Handle / Branding (Bottom Watermark)
                    </label>
                    <input
                      type="text"
                      value={settings.brandingText || ''}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          brandingText: e.target.value,
                        }))
                      }
                      placeholder="e.g. @username or channel name"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 text-xs focus:border-amber-400 focus:outline-none transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: 1-CLICK PRESETS */}
              {activeTab === 'presets' && (
                <div className="space-y-3">
                  <p className="text-zinc-400 text-xs">
                    Apply high-converting viral presets tuned for YouTube Shorts and Instagram Reels:
                  </p>
                  <div className="grid grid-cols-1 gap-2.5">
                    {THUMBNAIL_PRESETS.map((preset) => {
                      const isSelected = settings.preset === preset.id;
                      return (
                        <div
                          key={preset.id}
                          onClick={() => applyPreset(preset.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                            isSelected
                              ? 'bg-amber-500/10 border-amber-400 shadow-md shadow-amber-400/10'
                              : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/40'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-zinc-100 text-sm">
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
                            <p className="text-[11px] text-zinc-400">
                              {preset.tagline}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {isSelected && (
                              <div className="w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center text-black font-bold">
                                <Check className="w-3.5 h-3.5" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 3: TYPOGRAPHY & STYLING */}
              {activeTab === 'typography' && (
                <div className="space-y-4">
                  {/* Google Font Family Picker */}
                  <div>
                    <label className="font-semibold text-zinc-200 mb-1.5 block">
                      Google Font Family
                    </label>
                    <div className="relative">
                      <button
                        onClick={() => setIsFontDropdownOpen(!isFontDropdownOpen)}
                        className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-xl px-3 py-2 text-left flex items-center justify-between text-zinc-200"
                      >
                        <span
                          className="font-bold text-sm"
                          style={{ fontFamily: settings.fontFamily }}
                        >
                          {settings.fontFamily}
                        </span>
                        <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 font-mono">
                          Change Font
                        </span>
                      </button>

                      {isFontDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl p-2 z-30 max-h-56 overflow-y-auto space-y-1">
                          <input
                            type="text"
                            value={fontSearch}
                            onChange={(e) => setFontSearch(e.target.value)}
                            placeholder="Search Google fonts..."
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none mb-2"
                          />
                          {filteredFonts.map((font) => (
                            <button
                              key={font.name}
                              onClick={() => {
                                setSettings((prev) => ({
                                  ...prev,
                                  fontFamily: font.name,
                                }));
                                setIsFontDropdownOpen(false);
                              }}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                                settings.fontFamily === font.name
                                  ? 'bg-amber-400 text-black font-bold'
                                  : 'hover:bg-zinc-800 text-zinc-300'
                              }`}
                            >
                              <span style={{ fontFamily: font.name }} className="text-sm">
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
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            fontSize: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-amber-400 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-zinc-300 mb-1 block">
                        Font Weight
                      </label>
                      <select
                        value={settings.fontWeight}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            fontWeight: e.target.value,
                          }))
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-1.5 text-zinc-200 text-xs"
                      >
                        <option value="700">700 Bold</option>
                        <option value="800">800 Extra Bold</option>
                        <option value="900">900 Black</option>
                      </select>
                    </div>
                  </div>

                  {/* Color Controls: Text Color & Highlight Color (default #FCD905) */}
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
                            onChange={(e) =>
                              setSettings((prev) => ({
                                ...prev,
                                textColor: e.target.value,
                              }))
                            }
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
                            onChange={(e) =>
                              setSettings((prev) => ({
                                ...prev,
                                highlightColor: e.target.value,
                              }))
                            }
                            className="w-7 h-7 rounded border border-zinc-700 bg-transparent cursor-pointer"
                          />
                          <span className="font-mono text-[11px] text-amber-300 font-bold">
                            {settings.highlightColor || '#FCD905'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stroke / Outline & Drop Shadow */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-zinc-300">
                          Text Stroke Outline
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
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            strokeWidth: Number(e.target.value),
                          }))
                        }
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
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            shadowBlur: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-amber-400 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Uppercase & Card Backdrop Switches */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800">
                    <label className="flex items-center gap-2 p-2 rounded-xl bg-zinc-950 border border-zinc-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.textTransform === 'uppercase'}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            textTransform: e.target.checked ? 'uppercase' : 'none',
                          }))
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
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            boxBackground: e.target.checked,
                          }))
                        }
                        className="accent-amber-400 rounded"
                      />
                      <span className="text-zinc-300 font-semibold text-[11px]">
                        Glass Box Card
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* TAB 4: LAYOUT & BACKGROUND */}
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
                          onClick={() => setSettings((prev) => ({ ...prev, textAlign: id }))}
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
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              customX: Number(e.target.value),
                            }))
                          }
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
                          onClick={() => setSettings((prev) => ({ ...prev, position: pos.id }))}
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
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              customY: Number(e.target.value),
                            }))
                          }
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

                  {/* Advanced safe-zone controls removed from the thumbnail modal. */}
                  {/* Dark Vignette / Contrast Overlay */}
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
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          overlayDarkness: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-amber-400 cursor-pointer"
                    />

                    <div>
                      <label className="text-[10px] text-zinc-400 mb-1 block">
                        Overlay Gradient Type
                      </label>
                      <select
                        value={settings.overlayType || 'radial-vignette'}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            overlayType: e.target.value as any,
                          }))
                        }
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-200 text-xs"
                      >
                        <option value="radial-vignette">Radial Vignette (Punchy Center)</option>
                        <option value="linear-bottom">Linear Bottom (Anchor)</option>
                        <option value="linear-top">Linear Top (Header Focus)</option>
                        <option value="full-dark">Full Dimming</option>
                      </select>
                    </div>
                  </div>

                  {/* Background Source Selector */}
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                    <label className="font-semibold text-zinc-200 block">
                      Background Source
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() =>
                          setSettings((prev) => ({
                            ...prev,
                            backgroundType: 'project',
                          }))
                        }
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          settings.backgroundType !== 'gradient'
                            ? 'bg-amber-500/10 border-amber-400 text-amber-300'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        <span className="font-bold block text-xs">Project Media</span>
                        <span className="text-[10px] opacity-75">
                          {project.image ? 'Using uploaded frame' : 'Default media frame'}
                        </span>
                      </button>

                      <button
                        onClick={() =>
                          setSettings((prev) => ({
                            ...prev,
                            backgroundType: 'gradient',
                          }))
                        }
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          settings.backgroundType === 'gradient'
                            ? 'bg-amber-500/10 border-amber-400 text-amber-300'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        <span className="font-bold block text-xs">Studio Gradients</span>
                        <span className="text-[10px] opacity-75">
                          Clean colored backdrop
                        </span>
                      </button>
                    </div>

                    {/* Gradient Picker if Gradient Mode */}
                    {settings.backgroundType === 'gradient' && (
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        {THUMBNAIL_GRADIENTS.map((grad) => (
                          <button
                            key={grad.id}
                            onClick={() =>
                              setSettings((prev) => ({
                                ...prev,
                                gradientPreset: grad.id,
                              }))
                            }
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

                    {/* Upload Custom Background Photo */}
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
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
