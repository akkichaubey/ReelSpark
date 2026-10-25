'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ShieldCheck,
  TrendingUp,
  Hash,
  Type,
  ExternalLink,
  Info,
  ChevronDown,
  Copy,
  Check,
} from 'lucide-react';
import { PostValidationReport, SocialPlatformKey } from '@/lib/social-intelligence/types';
import { SocialPlatformIcon } from './SocialPlatformIcon';

interface PostValidationCardProps {
  report: PostValidationReport | null;
  targetPlatform: SocialPlatformKey;
  loading?: boolean;
  hashtags?: string[];
  onCopyHashtag?: (tag: string, key: string) => void;
  onCopyAllHashtags?: () => void;
  copiedKey?: string | null;
  defaultExpanded?: boolean;
}

export const PostValidationCard: React.FC<PostValidationCardProps> = ({
  report,
  targetPlatform,
  loading = false,
  hashtags = [],
  onCopyHashtag,
  onCopyAllHashtags,
  copiedKey,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  if (loading) {
    return (
      <div className="p-5 bg-zinc-900/60 border border-zinc-800 rounded-2xl animate-pulse space-y-4">
        <div className="h-6 bg-zinc-800 rounded w-1/3"></div>
        <div className="h-20 bg-zinc-800/60 rounded"></div>
        <div className="h-12 bg-zinc-800/40 rounded"></div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-5 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl text-center text-zinc-500 text-xs py-8">
        Enter or edit caption content to trigger real-time platform validation and quality scoring.
      </div>
    );
  }

  const { status, qualityScore, scoreBreakdown, characterCount, characterLimit, hashtagCount, hashtagLimit, checks, includedLinks } = report;

  // Percentage of character limit
  const charPercent = Math.min(100, Math.round((characterCount / characterLimit) * 100));
  const isOverCharLimit = characterCount > characterLimit;

  // Score color helper
  const getScoreColor = (score: number) => {
    if (score >= 80) return { text: 'text-emerald-400', stroke: '#10B981', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' };
    if (score >= 60) return { text: 'text-amber-400', stroke: '#F59E0B', bg: 'bg-amber-500/10', border: 'border-amber-500/30' };
    return { text: 'text-red-400', stroke: '#EF4444', bg: 'bg-red-500/10', border: 'border-red-500/30' };
  };

  const scoreTheme = getScoreColor(qualityScore);

  const getStatusBadge = () => {
    switch (status) {
      case 'ready':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-full text-xs font-semibold uppercase tracking-wider">
            <CheckCircle2 className="w-3.5 h-3.5" /> Ready to Publish
          </span>
        );
      case 'needs_attention':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-full text-xs font-semibold uppercase tracking-wider">
            <AlertTriangle className="w-3.5 h-3.5" /> Needs Attention
          </span>
        );
      case 'exceeds_limit':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-red-500/15 border border-red-500/30 text-red-400 rounded-full text-xs font-semibold uppercase tracking-wider">
            <AlertCircle className="w-3.5 h-3.5" /> Exceeds Platform Limits
          </span>
        );
    }
  };

  // Target platform exclusion verification
  const hasTargetLink = includedLinks.some((l) => l.isTargetPlatform);

  return (
    <div className="p-5 bg-gradient-to-br from-zinc-900/90 to-zinc-950/80 border border-zinc-800 rounded-2xl shadow-xl transition-all">
      {/* Top Bar: Quality Score & Status with Accordion Toggle */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none transition-all ${
          isExpanded ? 'pb-4 border-b border-zinc-800/80' : 'pb-0'
        }`}
      >
        <div className="flex items-center gap-4">
          {/* Radial or Big Score Display */}
          <div
            className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl border ${scoreTheme.bg} ${scoreTheme.border} ${scoreTheme.text} shrink-0`}
          >
            <span className="text-2xl font-black leading-none">{qualityScore}</span>
            <span className="text-[9px] uppercase tracking-wider font-semibold opacity-80 mt-0.5">Score</span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white text-base">Platform Quality Assessment</h3>
              <SocialPlatformIcon platform={targetPlatform} size="sm" />
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Evaluated against real-time {targetPlatform} algorithms and constraints.
            </p>
          </div>
        </div>

        {/* Right side: Status Badge + Accordion Arrow Button */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {getStatusBadge()}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-1.5 rounded-xl border border-zinc-700/80 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95"
            aria-label={isExpanded ? 'Collapse assessment details' : 'Expand assessment details'}
            title={isExpanded ? 'Collapse assessment details' : 'Expand assessment details'}
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-300 ${
                isExpanded ? 'rotate-180 text-amber-400' : 'rotate-0 text-zinc-400'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Second Selected Area: Collapsible Accordion Body */}
      {isExpanded && (
        <div className="pt-5 space-y-5 animate-in fade-in duration-200">
          {/* Score Breakdown Bars */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-2.5 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-1">
              <div className="flex justify-between text-[11px] text-zinc-400">
                <span>Length</span>
                <span className="font-semibold text-zinc-200">{scoreBreakdown.lengthScore}/40</span>
              </div>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-purple-500 h-full rounded-full transition-all"
                  style={{ width: `${(scoreBreakdown.lengthScore / 40) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="p-2.5 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-1">
              <div className="flex justify-between text-[11px] text-zinc-400">
                <span>Hook Quality</span>
                <span className="font-semibold text-zinc-200">{scoreBreakdown.hookScore}/20</span>
              </div>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full transition-all"
                  style={{ width: `${(scoreBreakdown.hookScore / 20) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="p-2.5 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-1">
              <div className="flex justify-between text-[11px] text-zinc-400">
                <span>Call to Action</span>
                <span className="font-semibold text-zinc-200">{scoreBreakdown.ctaScore}/20</span>
              </div>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all"
                  style={{ width: `${(scoreBreakdown.ctaScore / 20) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="p-2.5 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-1">
              <div className="flex justify-between text-[11px] text-zinc-400">
                <span>Hashtags</span>
                <span className="font-semibold text-zinc-200">{scoreBreakdown.hashtagScore}/20</span>
              </div>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-pink-500 h-full rounded-full transition-all"
                  style={{ width: `${(scoreBreakdown.hashtagScore / 20) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Counters: Characters & Hashtags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Character Count Meter */}
            <div className="p-3.5 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-zinc-400" /> Character Count
                </span>
                <span className={`font-mono font-semibold ${isOverCharLimit ? 'text-red-400 font-bold' : 'text-zinc-200'}`}>
                  {characterCount.toLocaleString()} / {characterLimit.toLocaleString()}
                </span>
              </div>
              <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    isOverCharLimit ? 'bg-red-500' : charPercent > 90 ? 'bg-amber-500' : 'bg-purple-500'
                  }`}
                  style={{ width: `${charPercent}%` }}
                ></div>
              </div>
            </div>

            {/* Hashtags Meter */}
            <div className="p-3.5 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-zinc-400" /> Hashtag Count
                </span>
                <span className={`font-mono font-semibold ${hashtagCount > hashtagLimit ? 'text-red-400' : 'text-zinc-200'}`}>
                  {hashtagCount} / {hashtagLimit} max
                </span>
              </div>
              <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    hashtagCount > hashtagLimit ? 'bg-red-500' : 'bg-pink-500'
                  }`}
                  style={{ width: `${Math.min(100, (hashtagCount / (hashtagLimit || 1)) * 100)}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Target Platform Exclusion Banner */}
          <div
            className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
              hasTargetLink
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                {hasTargetLink
                  ? `Warning: Target ${targetPlatform} account link is detected in the caption.`
                  : `Target platform exclusion verified: Your ${targetPlatform} account link is cleanly excluded.`}
              </span>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900/60 border border-white/10 shrink-0">
              {includedLinks.length} external links
            </span>
          </div>

          {/* Compliance Checks & Diagnostics List */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Compliance Checks &amp; Diagnostics ({checks.length})
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {checks.map((chk) => (
                <div
                  key={chk.id}
                  className={`p-2.5 rounded-lg border text-xs flex items-start justify-between gap-3 ${
                    chk.status === 'pass'
                      ? 'bg-zinc-950/40 border-zinc-800/80 text-zinc-300'
                      : chk.status === 'warning'
                      ? 'bg-amber-500/5 border-amber-500/25 text-amber-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {chk.status === 'pass' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    )}
                    {chk.status === 'warning' && (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    {chk.status === 'error' && (
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-medium text-white">{chk.name}</div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">{chk.message}</div>
                    </div>
                  </div>

                  {chk.currentValue !== undefined && chk.limitValue !== undefined && (
                    <div className="font-mono text-[11px] text-zinc-400 shrink-0">
                      {chk.currentValue}/{chk.limitValue}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Target Hashtags Section (Integrated into Accordion) */}
          {hashtags && hashtags.length > 0 && (
            <div className="pt-3 border-t border-zinc-800/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Hash className="w-4 h-4 text-amber-400" />
                  <span>Target Hashtags ({hashtags.length})</span>
                </span>
                {onCopyAllHashtags && (
                  <button
                    type="button"
                    onClick={onCopyAllHashtags}
                    className="flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200 font-semibold cursor-pointer transition-colors"
                  >
                    {copiedKey === 'hashtags_only' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Hashtags Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy All Hashtags</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {hashtags.map((tag, tIdx) => (
                  <span
                    key={tIdx}
                    onClick={() => onCopyHashtag && onCopyHashtag(tag, `tag_${tIdx}`)}
                    className="px-2.5 py-1 rounded-md text-xs font-mono bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-amber-300 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors"
                    title="Click to copy this hashtag"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
