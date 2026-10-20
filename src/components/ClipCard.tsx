'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Play,
  Scissors,
  Download,
  ChevronDown,
  ChevronUp,
  RotateCw,
  Award,
  Clock,
  Sparkles,
  Sliders,
  Copy,
  Check,
  Share2,
} from 'lucide-react';
import { ClipCandidate } from '@/lib/types';
import { getBilingualCandidateData } from '@/lib/bilingual';
import { SocialPostModal } from '@/components/caption-maker/SocialPostModal';

interface ClipCardProps {
  candidate: ClipCandidate;
  rank: number;
  onToggleSelect: (id: string) => void;
  onPlayPreview: (candidate: ClipCandidate) => void;
  onEditBoundaries: (candidate: ClipCandidate) => void;
  onPreviewSubtitles: (candidate: ClipCandidate) => void;
  onRenderClip: (id: string) => void;
  onDownloadSrt: (candidate: ClipCandidate) => void;
  onCreateReel?: (candidate: ClipCandidate, lang: 'en' | 'hi') => void | Promise<void>;
  isRenderingThis: boolean;
  globalLang?: 'en' | 'hi';
}

export const ClipCard: React.FC<ClipCardProps> = ({
  candidate,
  rank,
  onToggleSelect,
  onPlayPreview,
  onEditBoundaries,
  onPreviewSubtitles,
  onRenderClip,
  onDownloadSrt,
  onCreateReel,
  isRenderingThis,
  globalLang,
}) => {
  const router = useRouter();
  const [localLang, setLocalLang] = useState<'en' | 'hi' | null>(null);
  const lang = localLang ?? globalLang ?? 'en';
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  const [showScoreDetails, setShowScoreDetails] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [copiedTitle, setCopiedTitle] = useState(false);
  const [copiedQuote, setCopiedQuote] = useState(false);
  const [isCreatingReel, setIsCreatingReel] = useState(false);
  const [showSocialModal, setShowSocialModal] = useState(false);

  const bData = getBilingualCandidateData(candidate, lang);

  const copyTextToClipboard = async (text: string, onSuccess: () => void) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        onSuccess();
        return;
      }
    } catch {
      // fallback below
    }
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      onSuccess();
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleCopyTitle = () => {
    copyTextToClipboard(bData.title, () => {
      setCopiedTitle(true);
      setTimeout(() => setCopiedTitle(false), 2000);
    });
  };

  const handleCopyQuote = () => {
    copyTextToClipboard(bData.transcript, () => {
      setCopiedQuote(true);
      setTimeout(() => setCopiedQuote(false), 2000);
    });
  };

  const handleCreateReelClick = async () => {
    if (isCreatingReel) return;
    setIsCreatingReel(true);
    try {
      if (onCreateReel) {
        await onCreateReel(candidate, lang);
      } else {
        const { createCaptionProjectFromClip } = await import('@/lib/caption-maker/clip-to-reel');
        const reelProj = createCaptionProjectFromClip(candidate, null, lang);
        try {
          localStorage.setItem('reel_caption_project_v2', JSON.stringify(reelProj));
          localStorage.setItem('reel_caption_project_v1', JSON.stringify(reelProj));
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('reel_project_updated', { detail: reelProj }));
          }
        } catch (e) {
          console.warn('Could not save to localStorage', e);
        }
        router.push(`/caption-maker?clipId=${encodeURIComponent(candidate.id)}&t=${Date.now()}`);
      }
    } catch (e) {
      console.error('Error creating reel project:', e);
    } finally {
      setIsCreatingReel(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isRendered = candidate.renderStatus === 'completed' && candidate.renderedVideoPath;
  const renderedDownloadUrl = candidate.renderedVideoPath
    ? `/api/files/${candidate.renderedVideoPath.split('storage/')[1] || candidate.renderedVideoPath.split('storage\\')[1]}`
    : null;

  return (
    <div
      className={`glass-panel rounded-2xl p-5 border transition-all glass-panel-hover flex flex-col justify-between ${
        candidate.selected ? 'border-white/60 shadow-white/5' : 'border-white/10'
      }`}
    >
      <div>
        {/* Top Header: Checkbox, Rank, Topic, Language Toggle, and Score Badge */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <input
              type="checkbox"
              checked={candidate.selected}
              onChange={() => onToggleSelect(candidate.id)}
              className="w-4 h-4 rounded bg-zinc-900 border-white/20 text-zinc-900 focus:ring-0 cursor-pointer"
            />
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300">
              #{rank}
            </span>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border bg-zinc-800/80 text-zinc-200 border-white/15">
              {candidate.topic}
            </span>
            {isRendered && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                MP4
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {/* Hindi / English Language Toggle */}
            <div className="flex items-center p-0.5 rounded-lg bg-zinc-950 border border-white/10 text-[11px] font-semibold flex-shrink-0">
              <button
                type="button"
                onClick={() => setLocalLang('en')}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                  lang === 'en'
                    ? 'bg-white text-zinc-950 shadow-sm font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
                title="View in English"
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLocalLang('hi')}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                  lang === 'hi'
                    ? 'bg-white text-zinc-950 shadow-sm font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
                title="हिंदी में देखें"
              >
                हिंदी
              </button>
            </div>

            {/* Score Badge in Gold/Amber */}
            <button
              type="button"
              onClick={() => setShowScoreDetails(!showScoreDetails)}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-bold text-xs tracking-tight shadow-sm shadow-amber-500/10 transition-all flex-shrink-0 cursor-pointer"
              title="Click to toggle score breakdown"
            >
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>Score: {candidate.scores.total}/100</span>
            </button>
          </div>
        </div>

        {/* Title in Selected Language with Copy Action */}
        <div className="flex items-center gap-2 mt-3 group/title">
          <h3
            onClick={() => onPlayPreview(candidate)}
            className="text-base sm:text-lg font-bold text-white tracking-tight hover:text-zinc-200 transition-colors cursor-pointer flex-1"
            title="Click to play clip"
          >
            {bData.title}
          </h3>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopyTitle();
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/90 border border-transparent hover:border-white/10 transition-all cursor-pointer flex items-center justify-center flex-shrink-0"
            title={copiedTitle ? 'Title copied!' : 'Copy title to clipboard'}
            aria-label="Copy title"
          >
            {copiedTitle ? (
              <span className="flex items-center space-x-1 text-emerald-400 text-xs font-semibold">
                <Check className="w-4 h-4 animate-in zoom-in duration-150" />
                <span className="text-[10px]">Copied</span>
              </span>
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Timestamps & Context Badge */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 pt-1.5">
          <span className="flex items-center space-x-1 font-mono">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>{formatTime(candidate.start)} - {formatTime(candidate.end)}</span>
          </span>
          <span>•</span>
          <span className="font-mono">{candidate.duration.toFixed(0)}s</span>
          <span>•</span>
          {candidate.contextVerification.flaggedForReview ? (
            <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md uppercase bg-amber-950/60 text-amber-400 border border-amber-800/50">
              CONTEXT: REVIEW SUGGESTED
            </span>
          ) : (
            <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md uppercase bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
              CONTEXT: HIGH CONFIDENCE
            </span>
          )}
        </div>

        {/* Spoken Words / Quotes block with 3-line clamp, Expand option & Copy Quote button */}
        <div className="relative mt-3.5 p-3.5 rounded-xl bg-zinc-900/80 border border-white/5 space-y-2 text-xs group/quote">
          {/* Top-Right Copy Quote Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopyQuote();
            }}
            className="absolute top-2.5 right-2.5 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/90 border border-transparent hover:border-white/10 transition-all cursor-pointer flex items-center justify-center z-10"
            title={copiedQuote ? 'Quote copied!' : 'Copy quote transcript to clipboard'}
            aria-label="Copy quote text"
          >
            {copiedQuote ? (
              <span className="flex items-center space-x-1 text-emerald-400 text-xs font-semibold">
                <Check className="w-3.5 h-3.5 animate-in zoom-in duration-150" />
                <span className="text-[10px]">Copied</span>
              </span>
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          <p
            className={`text-zinc-200 italic leading-relaxed transition-all pr-14 ${
              isTextExpanded ? '' : 'line-clamp-3'
            }`}
          >
            &ldquo;{bData.transcript}&rdquo;
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/5">
            <button
              type="button"
              onClick={() => setIsTextExpanded(!isTextExpanded)}
              className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 flex items-center space-x-1 cursor-pointer transition-colors"
            >
              <span>{isTextExpanded ? 'Show less' : 'Read full quote...'}</span>
              {isTextExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500 font-mono">
              <span>In: &quot;{bData.firstWords}&quot;</span>
              <span>•</span>
              <span>Out: &quot;{bData.lastWords}&quot;</span>
            </div>
          </div>
        </div>

        {/* Sparkle Explanation in Selected Language */}
        <div className="mt-3 flex items-start space-x-2 text-xs text-zinc-300">
          <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed text-zinc-300">{bData.explanation}</p>
        </div>

        {/* Collapsible Score Details */}
        {showScoreDetails && (
          <div className="mt-3 p-4 rounded-xl bg-zinc-900/90 border border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs shadow-inner">
            <div>
              <span className="text-zinc-500 block text-[10px] uppercase">Meaning & Depth</span>
              <span className="font-bold text-zinc-200">{candidate.scores.meaningAndDepth} / 25</span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[10px] uppercase">Standalone</span>
              <span className="font-bold text-zinc-200">{candidate.scores.standaloneCompleteness} / 20</span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[10px] uppercase">Opening Hook</span>
              <span className="font-bold text-zinc-200">{candidate.scores.openingStrength} / 15</span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[10px] uppercase">Emotional Impact</span>
              <span className="font-bold text-zinc-200">{candidate.scores.emotionalIntellectualImpact} / 15</span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[10px] uppercase">Clarity</span>
              <span className="font-bold text-zinc-200">{candidate.scores.clarity} / 10</span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[10px] uppercase">Conciseness</span>
              <span className="font-bold text-zinc-200">{candidate.scores.conciseness} / 10</span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[10px] uppercase">Audio Quality</span>
              <span className="font-bold text-zinc-200">{candidate.scores.audioQuality} / 5</span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[10px] uppercase">Total</span>
              <span className="font-bold text-amber-400">{candidate.scores.total} / 100</span>
            </div>
          </div>
        )}
      </div>

      {/* Action Toolbar */}
      <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Play Clip in Emerald */}
          <button
            type="button"
            onClick={() => onPlayPreview(candidate)}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-400 hover:text-emerald-300 font-semibold text-xs border border-emerald-500/50 shadow-sm shadow-emerald-500/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
            title="Play clip preview with synchronized subtitles"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Play Clip</span>
          </button>

          {/* Edit Clip */}
          <button
            type="button"
            onClick={() => onEditBoundaries(candidate)}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-semibold text-xs border border-zinc-700/60 transition-all hover:scale-[1.02] active:scale-[0.98]"
            title="Edit boundaries, trim duration, and title"
          >
            <Scissors className="w-3.5 h-3.5 text-zinc-300" />
            <span>Edit Clip</span>
          </button>

          {/* Studio */}
          <button
            type="button"
            onClick={() => onPreviewSubtitles(candidate)}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-semibold text-xs border border-zinc-700/60 transition-all hover:scale-[1.02] active:scale-[0.98]"
            title="Customize subtitle styling in Studio"
          >
            <Sliders className="w-3.5 h-3.5 text-zinc-300" />
            <span>Studio</span>
          </button>

          {/* AI Social Post */}
          <button
            type="button"
            onClick={() => setShowSocialModal(true)}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-semibold text-xs border border-zinc-700/60 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            title="Generate viral hooks, post captions & hashtags with AI"
          >
            <Share2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Social Post</span>
          </button>

          {/* Create Reel in Amber/Gold */}
          <button
            type="button"
            onClick={handleCreateReelClick}
            disabled={isCreatingReel}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 hover:text-amber-200 font-semibold text-xs border border-amber-500/40 shadow-sm shadow-amber-500/10 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            title="Open in AI Reel Caption Maker to create animated caption video"
          >
            <Sparkles className={`w-3.5 h-3.5 text-amber-400 fill-amber-400/20 ${isCreatingReel ? 'animate-spin' : ''}`} />
            <span>{isCreatingReel ? 'Preparing...' : 'Create Reel'}</span>
          </button>
        </div>

        {/* Download Clip dropdown */}
        <div className="relative inline-flex items-center gap-1.5">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDownloadMenu(!showDownloadMenu)}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-semibold text-xs border border-zinc-700/60 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-zinc-300" />
              <span>Download Clip</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>

            {showDownloadMenu && (
              <div className="absolute right-0 bottom-full mb-2 w-48 rounded-xl bg-zinc-900 border border-white/10 shadow-2xl p-1 z-30 space-y-0.5">
                {isRendered && renderedDownloadUrl ? (
                  <a
                    href={renderedDownloadUrl}
                    download={`${candidate.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`}
                    onClick={() => setShowDownloadMenu(false)}
                    className="flex items-center space-x-2 w-full px-3 py-2 rounded-lg text-xs font-semibold text-white hover:bg-zinc-800 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Download MP4 Video</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShowDownloadMenu(false);
                      onRenderClip(candidate.id);
                    }}
                    disabled={isRenderingThis}
                    className="flex items-center space-x-2 w-full px-3 py-2 rounded-lg text-xs font-semibold text-white hover:bg-zinc-800 transition-colors text-left disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isRenderingThis ? 'Rendering MP4...' : 'Render & Download MP4'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowDownloadMenu(false);
                    onDownloadSrt(candidate);
                  }}
                  className="flex items-center space-x-2 w-full px-3 py-2 rounded-lg text-xs font-medium text-amber-300 hover:bg-zinc-800 transition-colors text-left"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>Download SRT Subtitles</span>
                </button>
              </div>
            )}
          </div>

          {/* Re-render button */}
          {isRendered && (
            <button
              type="button"
              onClick={() => onRenderClip(candidate.id)}
              disabled={isRenderingThis}
              title="Re-render this clip with current settings"
              className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-zinc-700/60 transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* AI Social Media Post Copywriter Modal */}
      <SocialPostModal
        isOpen={showSocialModal}
        onClose={() => setShowSocialModal(false)}
        transcript={
          lang === 'hi'
            ? candidate.transcriptHindi || candidate.transcript
            : candidate.transcriptEnglish || candidate.transcript
        }
        title={bData.title}
        duration={candidate.duration}
        initialLanguage={lang}
      />
    </div>
  );
};
