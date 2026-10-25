'use strict';
'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Copy,
  Check,
  RotateCw,
  Hash,
  Flame,
  MessageSquare,
  Bookmark,
  Share2,
  Info,
  Loader2,
  AlertTriangle,
  RotateCcw,
  ChevronDown,
} from 'lucide-react';
import { SocialPostBundle, ContentTone, SocialPlatform } from '@/app/api/caption-maker/generate-social/route';
import { getPlatformDescriptionLimit, PLATFORM_DESCRIPTION_LIMITS } from '@/lib/social-intelligence/platform-rules';

interface SocialPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  transcript: string;
  title?: string;
  duration?: number;
  initialLanguage?: 'en' | 'hi' | 'hinglish';
}

export const SocialPostModal: React.FC<SocialPostModalProps> = ({
  isOpen,
  onClose,
  transcript,
  title,
  duration,
  initialLanguage = 'en',
}) => {
  const [language, setLanguage] = useState<'en' | 'hi' | 'hinglish'>(initialLanguage);
  const [tone, setTone] = useState<ContentTone>('motivational');
  const [platform, setPlatform] = useState<SocialPlatform>('all');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [bundle, setBundle] = useState<SocialPostBundle | null>(null);
  const [selectedVariationIdx, setSelectedVariationIdx] = useState<number>(0);
  const [editedText, setEditedText] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialLanguage) {
      setLanguage(initialLanguage);
    }
  }, [initialLanguage]);

  // Fetch or regenerate social post bundle
  const handleGenerate = async (
    targetLang = language,
    targetTone = tone,
    targetPlatform = platform
  ) => {
    if (!transcript || transcript.trim().length === 0) {
      setErrorMessage('No transcript text available for this clip.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/caption-maker/generate-social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          title,
          duration,
          language: targetLang,
          tone: targetTone,
          platform: targetPlatform,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate social media post copy');
      }

      setBundle(data.bundle);
      setSelectedVariationIdx(0);
      const firstVar = data.bundle.variations?.[0];
      setEditedText(firstVar ? firstVar.fullText : '');
    } catch (err: any) {
      console.error('Error generating social post:', err);
      setErrorMessage(err?.message || 'Failed to generate copy. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-generate on first open if bundle is empty
  useEffect(() => {
    if (isOpen && !bundle && !isLoading) {
      handleGenerate();
    }
  }, [isOpen]);

  // Update edited text when changing variation tab
  const handleSelectVariation = (idx: number) => {
    setSelectedVariationIdx(idx);
    if (bundle?.variations?.[idx]) {
      setEditedText(bundle.variations[idx].fullText);
    }
  };

  // Copy helper with visual feedback
  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-zinc-950/80 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black font-bold shadow-md shadow-amber-500/20">
              <Sparkles className="w-4 h-4 fill-black" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>AI Reel Caption & Social Copywriter</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-mono uppercase tracking-wider">
                  Instagram • Shorts • TikTok
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                Generate viral hooks, engaging post captions, CTAs & hashtags from this clip only.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Clear Informative Banner distinguishing Spoken Subtitles vs Social Post Captions */}
        <div className="px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2.5 text-xs text-amber-200 shrink-0">
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Distinction:</strong> Spoken subtitles are burned onto your video screen. This tool generates the <strong>social media post caption, hooks & hashtags</strong> to paste into your Instagram, YouTube Shorts, or TikTok description box.
          </span>
        </div>

        {/* Controls Bar: Tone, Language & Platform */}
        <div className="p-4 bg-zinc-950/40 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Tone Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-400 font-medium">Tone:</span>
              <div className="relative inline-flex items-center">
                <select
                  value={tone}
                  onChange={(e) => {
                    const newTone = e.target.value as ContentTone;
                    setTone(newTone);
                    handleGenerate(language, newTone, platform);
                  }}
                  className="appearance-none bg-zinc-900 border border-zinc-700/80 hover:border-zinc-600 text-xs text-zinc-200 rounded-lg pl-3 pr-8 py-1.5 focus:border-amber-400 focus:outline-none capitalize cursor-pointer shadow-sm transition-colors"
                >
                  <option value="motivational">🔥 Motivational</option>
                  <option value="educational">💡 Educational</option>
                  <option value="storytelling">📖 Storytelling</option>
                  <option value="funny">😂 Funny / Viral</option>
                  <option value="emotional">❤️ Emotional / Deep</option>
                  <option value="professional">💼 Professional</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            {/* Language Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-400 font-medium">Language:</span>
              <div className="flex items-center bg-zinc-900 p-0.5 rounded-lg border border-zinc-700">
                {[
                  { id: 'en', label: 'English' },
                  { id: 'hi', label: 'हिन्दी' },
                  { id: 'hinglish', label: 'Hinglish' },
                ].map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      const newLang = l.id as 'en' | 'hi' | 'hinglish';
                      setLanguage(newLang);
                      handleGenerate(newLang, tone, platform);
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      language === l.id
                        ? 'bg-amber-400 text-black shadow-sm font-bold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Platform Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-400 font-medium">Platform:</span>
              <div className="relative inline-flex items-center">
                <select
                  value={platform}
                  onChange={(e) => {
                    const newPlatform = e.target.value as SocialPlatform;
                    setPlatform(newPlatform);
                    handleGenerate(language, tone, newPlatform);
                  }}
                  className="appearance-none bg-zinc-900 border border-zinc-700/80 hover:border-zinc-600 text-xs text-zinc-200 rounded-lg pl-3 pr-8 py-1.5 focus:border-amber-400 focus:outline-none capitalize cursor-pointer shadow-sm transition-colors"
                >
                  <option value="all">🌐 All Platforms</option>
                  <option value="instagram">📸 Instagram Reels</option>
                  <option value="youtube">▶️ YouTube Shorts</option>
                  <option value="tiktok">🎵 TikTok</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          </div>

          {/* Regenerate Button */}
          <button
            type="button"
            onClick={() => handleGenerate()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-lg text-xs font-semibold border border-zinc-700 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
            <span>Regenerate</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3 text-center">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
              <p className="text-sm font-semibold text-zinc-200">
                Generating high-converting social post copy with Gemini...
              </p>
              <p className="text-xs text-zinc-500 max-w-sm">
                Crafting viral hooks, engaging description body, CTAs, and curated hashtags tailored to this clip.
              </p>
            </div>
          ) : errorMessage ? (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-center space-y-2">
              <p className="text-xs text-rose-300 font-medium">{errorMessage}</p>
              <button
                type="button"
                onClick={() => handleGenerate()}
                className="px-3 py-1 bg-rose-500/20 text-rose-300 rounded text-xs font-semibold hover:bg-rose-500/30 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : bundle ? (
            <>
              {/* 1. Viral Opening Hooks Cards */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    <span>Viral Opening Hooks (First 3 Seconds)</span>
                  </span>
                  <span className="text-[10px] text-zinc-500 font-normal">
                    Click any hook to copy or use in caption
                  </span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {bundle.hooks.map((hook, hIdx) => {
                    const isCopied = copiedKey === `hook_${hIdx}`;
                    return (
                      <div
                        key={hIdx}
                        onClick={() => handleCopy(hook, `hook_${hIdx}`)}
                        className="p-3 bg-zinc-950/80 hover:bg-zinc-800/80 border border-zinc-800 hover:border-amber-500/50 rounded-xl cursor-pointer transition-all flex flex-col justify-between group shadow-sm"
                      >
                        <p className="text-xs text-zinc-200 leading-snug font-medium mb-2">
                          "{hook}"
                        </p>
                        <div className="flex items-center justify-between text-[10px] text-zinc-500 group-hover:text-amber-400">
                          <span>Hook #{hIdx + 1}</span>
                          <span className="flex items-center gap-1 font-semibold">
                            {isCopied ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy Hook</span>
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. Enhanced Post Description / Copy Area with Limits Reference */}
              {(() => {
                const platformDescLimit = getPlatformDescriptionLimit(platform);
                const charCount = editedText.length;
                const maxChars = platformDescLimit.max;
                const isOverLimit = charCount > maxChars;
                const isOptimal = charCount >= platformDescLimit.recMin && charCount <= platformDescLimit.recMax;
                const wordsCount = editedText.trim() ? editedText.trim().split(/\s+/).length : 0;
                const hashtagsInText = (editedText.match(/#[a-zA-Z0-9_\u0900-\u097F]+/g) || []).length;
                const percentUsed = Math.min(100, Math.round((charCount / maxChars) * 100));
                const originalVariationText = bundle.variations?.[selectedVariationIdx]?.fullText || '';
                const isModified = originalVariationText !== '' && editedText !== originalVariationText;

                return (
                  <div className="p-3.5 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-3">
                    {/* Header: Title, Platform Label, and Live Limits Counter */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-zinc-800/60">
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-xs font-bold text-zinc-200">
                          Complete Post Copy (Ready to Paste)
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700/60 text-zinc-300">
                          {platformDescLimit.label}
                        </span>
                      </div>

                      {/* Live Counter Badge */}
                      <div
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[11px] font-bold ${
                          isOverLimit
                            ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                            : isOptimal
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                        }`}
                      >
                        {isOverLimit ? (
                          <>
                            <AlertTriangle className="w-3 h-3 text-rose-400" />
                            <span>{charCount.toLocaleString()}/{maxChars.toLocaleString()}</span>
                            <span className="text-[9px] font-sans text-rose-400 uppercase">
                              (+{charCount - maxChars} OVER)
                            </span>
                          </>
                        ) : isOptimal ? (
                          <>
                            <Sparkles className="w-3 h-3 text-emerald-400" />
                            <span>{charCount.toLocaleString()}/{maxChars.toLocaleString()}</span>
                            <span className="text-[9px] font-sans text-emerald-400 uppercase">
                              (SWEET SPOT)
                            </span>
                          </>
                        ) : (
                          <>
                            <span>{charCount.toLocaleString()}/{maxChars.toLocaleString()}</span>
                            <span className="text-[9px] font-sans text-zinc-500 uppercase">
                              CHARS
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Toolbar Ribbon: Variation Switcher & Stats */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      {/* Variation Switcher */}
                      <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
                        {bundle.variations.map((v, vIdx) => (
                          <button
                            key={vIdx}
                            type="button"
                            onClick={() => handleSelectVariation(vIdx)}
                            className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                              selectedVariationIdx === vIdx
                                ? 'bg-amber-400 text-black shadow-sm font-bold'
                                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                            }`}
                          >
                            {v.title}
                          </button>
                        ))}
                      </div>

                      {/* Metrics Strip */}
                      <div className="flex items-center gap-2.5 text-[10px] text-zinc-400">
                        <span><strong className="text-zinc-200">{wordsCount}</strong> words</span>
                        <span className="text-zinc-600">·</span>
                        <span><strong className="text-zinc-200">{hashtagsInText}</strong> tags</span>
                        <span className="text-zinc-600">·</span>
                        <span className="text-zinc-300">Rec: {platformDescLimit.recMin}–{platformDescLimit.recMax}</span>
                        {isModified && (
                          <>
                            <span className="text-zinc-600">·</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (bundle?.variations?.[selectedVariationIdx]) {
                                  setEditedText(bundle.variations[selectedVariationIdx].fullText);
                                }
                              }}
                              className="flex items-center gap-1 text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                              title="Reset to AI copy"
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                              <span>Reset</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Editable Text Area for Selected Variation with Progress Bar */}
                    <div className="relative rounded-xl border border-zinc-700/80 bg-zinc-950 overflow-hidden shadow-inner focus-within:border-amber-400">
                      {/* Progress Bar Header */}
                      <div className="h-1 w-full bg-zinc-900 overflow-hidden relative">
                        <div
                          className={`h-full transition-all duration-300 ${
                            isOverLimit
                              ? 'bg-rose-500'
                              : isOptimal
                              ? 'bg-emerald-400'
                              : 'bg-amber-400'
                          }`}
                          style={{ width: `${percentUsed}%` }}
                        />
                      </div>

                      <textarea
                        rows={8}
                        value={editedText}
                        onChange={(e) => setEditedText(e.target.value)}
                        className="w-full bg-transparent p-3.5 text-xs text-zinc-200 font-sans leading-relaxed focus:outline-none resize-none shadow-inner"
                        placeholder="Social media caption text..."
                      />

                      {/* Floating Copy Action on Textarea */}
                      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopy(editedText, 'full_post')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-md ${
                            copiedKey === 'full_post'
                              ? 'bg-emerald-500 text-black'
                              : 'bg-amber-400 hover:bg-amber-300 text-black shadow-amber-400/20 active:scale-95'
                          }`}
                        >
                          {copiedKey === 'full_post' ? (
                            <>
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                              <span>Copied Full Post!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Post</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 3. Hashtags Cloud Section */}
              <div className="p-3.5 bg-zinc-950/70 border border-zinc-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-amber-400" />
                    <span>Target Hashtags ({bundle.hashtags.length})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(bundle.hashtags.join(' '), 'hashtags_only')}
                    className="flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200 font-semibold cursor-pointer"
                  >
                    {copiedKey === 'hashtags_only' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Hashtags Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy All Hashtags</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {bundle.hashtags.map((tag, tIdx) => (
                    <span
                      key={tIdx}
                      onClick={() => handleCopy(tag, `tag_${tIdx}`)}
                      className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-amber-300 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors"
                      title="Click to copy this hashtag"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-zinc-950/90 border-t border-zinc-800 flex items-center justify-between shrink-0">
          <span className="text-xs text-zinc-500 font-mono">
            {duration ? `Clip Duration: ${Math.round(duration)}s` : 'Selected Clip'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-800/80 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Close
            </button>
            {bundle && (
              <button
                type="button"
                onClick={() => handleCopy(editedText, 'full_post')}
                className="flex items-center gap-1.5 px-5 py-2 bg-amber-400 hover:bg-amber-300 text-black font-bold rounded-xl text-xs transition-all shadow-md shadow-amber-400/20 active:scale-95 cursor-pointer"
              >
                {copiedKey === 'full_post' ? (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Full Post</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
