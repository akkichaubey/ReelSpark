'use client';

import React, { useState } from 'react';
import {
  BookOpen,
  ExternalLink,
  Shield,
  Hash,
  Link as LinkIcon,
  Video,
  FileText,
  Search,
} from 'lucide-react';
import { SocialPlatformKey, RuleSeverity } from '@/lib/social-intelligence/types';
import { PLATFORM_CONFIGS } from '@/lib/social-intelligence/platform-rules';
import { SocialPlatformIcon } from './SocialPlatformIcon';

export const PlatformGuidelinesViewer: React.FC = () => {
  const [selectedPlatform, setSelectedPlatform] = useState<SocialPlatformKey>('instagram');
  const [searchQuery, setSearchQuery] = useState('');

  const config = PLATFORM_CONFIGS[selectedPlatform];
  const platforms: SocialPlatformKey[] = ['instagram', 'youtube', 'threads', 'facebook', 'website'];

  // Filter rules by query
  const filteredRules = config.rules.filter(
    (r) =>
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getSeverityBadge = (severity: RuleSeverity) => {
    switch (severity) {
      case 'mandatory':
        return (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
            Mandatory Hard Limit
          </span>
        );
      case 'platform_policy':
        return (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
            Platform Policy
          </span>
        );
      case 'recommended_best_practice':
        return (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
            Best Practice
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">
            Guidance
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-purple-400" />
            Social Platform Guidelines
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Reference limits and editorial guidance. Check the linked platform documentation before publishing.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <label htmlFor="guidelines-search" className="sr-only">
            Search platform guidelines
          </label>
          <input
            id="guidelines-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search specifications..."
            aria-controls="guidelines-rules"
            className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-purple-500"
          />
        </div>
      </div>

      {/* Platform Selector Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" role="group" aria-label="Select a platform">
        {platforms.map((pKey) => {
          const isSelected = selectedPlatform === pKey;
          const pConfig = PLATFORM_CONFIGS[pKey];
          return (
            <button
              key={pKey}
              type="button"
              onClick={() => setSelectedPlatform(pKey)}
              aria-pressed={isSelected}
              className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left ${
                isSelected
                  ? 'bg-purple-950/40 border-purple-500/60 shadow-lg shadow-purple-950/50'
                  : 'bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-800/60 hover:border-zinc-700'
              }`}
            >
              <SocialPlatformIcon platform={pKey} size="md" />
              <div className="min-w-0">
                <div className={`font-semibold text-sm ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                  {pConfig.name}
                </div>
                <div className="text-[11px] text-zinc-500 truncate">
                  {pConfig.officialDomain || 'Custom publishing rules'}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Quick Specs Dashboard Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Character Limit */}
        <div className="p-4 bg-zinc-900/70 border border-zinc-800 rounded-xl space-y-1.5">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-purple-400" /> Max Length
            </span>
          </div>
          <div className="text-xl font-bold text-white">
            {config.characterLimits.maxTotal.toLocaleString()}{' '}
            <span className="text-xs font-normal text-zinc-400">chars</span>
          </div>
          <div className="text-[11px] text-zinc-500">
            {config.characterLimits.captionPreFold
              ? `Truncates at ${config.characterLimits.captionPreFold} chars before fold`
              : 'Full caption displayed'}
          </div>
        </div>

        {/* Hashtags */}
        <div className="p-4 bg-zinc-900/70 border border-zinc-800 rounded-xl space-y-1.5">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-pink-400" /> Hashtag Rules
            </span>
          </div>
          <div className="text-xl font-bold text-white">
            {config.hashtagRules.recommendedMin}–{config.hashtagRules.recommendedMax}{' '}
            <span className="text-xs font-normal text-zinc-400">recommended</span>
          </div>
          <div className="text-[11px] text-zinc-500">
            Hard cap: {config.hashtagRules.maxAllowed} hashtags max
          </div>
        </div>

        {/* Links */}
        <div className="p-4 bg-zinc-900/70 border border-zinc-800 rounded-xl space-y-1.5">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5 text-blue-400" /> Clickable Links
            </span>
          </div>
          <div className="text-xl font-bold text-white">
            {config.linkCapabilities.clickableInCaption ? (
              <span className="text-emerald-400">Supported</span>
            ) : (
              <span className="text-amber-400">Plain text only</span>
            )}
          </div>
          <div className="text-[11px] text-zinc-500 truncate" title={config.linkCapabilities.notes}>
            {config.linkCapabilities.notes}
          </div>
        </div>

        {/* Media / Video */}
        <div className="p-4 bg-zinc-900/70 border border-zinc-800 rounded-xl space-y-1.5">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-emerald-400" /> Aspect Ratio
            </span>
          </div>
          <div className="text-base font-bold text-white truncate">
            {config.mediaRecommendations.recommendedAspectRatio.split(' ')[0]}
          </div>
          <div className="text-[11px] text-zinc-500">
            Up to {config.mediaRecommendations.maxDurationSeconds}s duration
          </div>
        </div>
      </div>

      {/* Rules & Guidelines Detailed Breakdown */}
      <div
        id="guidelines-rules"
        className="p-5 bg-zinc-900/70 border border-zinc-800 rounded-2xl space-y-4"
        aria-live="polite"
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <h3 className="font-semibold text-white text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-400" />
            Verified Technical Rules &amp; Best Practices ({filteredRules.length})
          </h3>
          <span className="text-xs text-zinc-500">
            Target Platform: <span className="text-zinc-300 font-medium">{config.name}</span>
          </span>
        </div>

        {filteredRules.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm">
            No rules match the filter &quot;{searchQuery}&quot;.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRules.map((rule) => (
              <div
                key={rule.id}
                className="p-4 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-2 hover:border-zinc-700 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-medium text-white text-sm">{rule.title}</span>
                    {getSeverityBadge(rule.ruleType)}
                  </div>

                  {rule.value !== undefined && (
                    <div className="text-xs font-mono px-2.5 py-1 bg-zinc-800/80 rounded-lg text-purple-300 font-semibold self-start sm:self-auto">
                      Limit: {rule.value} {rule.unit}
                    </div>
                  )}
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed">{rule.description}</p>

                {(rule.sourceUrl || rule.lastVerified) && (
                  <div className="flex items-center gap-4 pt-1 text-[11px] text-zinc-500">
                    {rule.lastVerified && <span>Reference updated: {rule.lastVerified}</span>}
                    {rule.sourceUrl && (
                      <a
                        href={rule.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-purple-400 hover:text-purple-300 underline underline-offset-2"
                      >
                        Reference source <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-zinc-500 leading-relaxed">
        This is a publishing reference, not a guarantee of eligibility or reach. Platform policies, feature availability,
        and account requirements can change by region and account; review the linked source before publishing.
      </p>
    </div>
  );
};
