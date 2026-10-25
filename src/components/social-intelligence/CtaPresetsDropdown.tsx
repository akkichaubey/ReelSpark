'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ChevronDown,
  MessageSquareText,
  UserPlus,
  Heart,
  Bookmark,
  MessageSquare,
  PlaySquare,
  Flame,
  Search,
  X,
  Check,
  Zap,
} from 'lucide-react';
import {
  CTA_CATEGORIES,
  CtaCategoryKey,
  CtaLanguage,
  CtaPreset,
  REELS_CTA_PRESETS,
  filterCtaPresets,
} from '@/lib/social-intelligence/cta-presets';

interface CtaPresetsDropdownProps {
  onSelect: (text: string) => void;
  currentValue?: string;
  className?: string;
  placeholder?: string;
}

const CATEGORY_ICONS: Record<CtaCategoryKey, React.ComponentType<{ className?: string }>> = {
  follow: UserPlus,
  like_share: Heart,
  save: Bookmark,
  comment: MessageSquare,
  watch_more: PlaySquare,
  motivational: Heart,
  viral: Flame,
};

export const CtaPresetsDropdown: React.FC<CtaPresetsDropdownProps> = ({
  onSelect,
  currentValue = '',
  className = '',
  placeholder = '⚡ Choose CTA Preset...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeLang, setActiveLang] = useState<CtaLanguage | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Filter presets based on language and search query
  const filteredPresets = useMemo(() => {
    return filterCtaPresets({
      language: activeLang,
      searchTerm: searchQuery,
    });
  }, [activeLang, searchQuery]);

  // Group filtered presets by category
  const groupedPresets = useMemo(() => {
    const groups: { category: CtaCategoryKey; items: CtaPreset[] }[] = [];
    const categoryKeys: CtaCategoryKey[] = [
      'follow',
      'like_share',
      'save',
      'comment',
      'watch_more',
      'motivational',
      'viral',
    ];

    categoryKeys.forEach((catKey) => {
      const items = filteredPresets.filter((p) => p.category === catKey);
      if (items.length > 0) {
        groups.push({ category: catKey, items });
      }
    });

    return groups;
  }, [filteredPresets]);

  // Determine current active preset match
  const matchedPreset = useMemo(() => {
    if (!currentValue || !currentValue.trim()) return null;
    return REELS_CTA_PRESETS.find(
      (p) => p.text.trim().toLowerCase() === currentValue.trim().toLowerCase()
    );
  }, [currentValue]);

  const handleSelectPreset = (preset: CtaPreset) => {
    onSelect(preset.text);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Dropdown Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full h-9 flex items-center justify-between gap-2 px-3 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
          isOpen
            ? 'bg-zinc-900 border-amber-400 text-white shadow-md shadow-amber-400/10'
            : matchedPreset
            ? 'bg-zinc-950 border-amber-400/50 text-amber-300 hover:border-amber-400'
            : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white'
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-1.5 truncate">
          <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate">
            {matchedPreset ? matchedPreset.text : placeholder}
          </span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-amber-400' : ''
          }`}
        />
      </button>

      {/* Floating Popover Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-[320px] sm:w-[380px] max-w-[95vw] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
          {/* Header Bar */}
          <div className="p-3 border-b border-zinc-800 bg-zinc-950/70">
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                <MessageSquareText className="w-3.5 h-3.5 text-amber-400" />
                <span>Reels Description Headings & CTAs</span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Language Filter Tabs */}
            <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-xl border border-zinc-800 text-[11px]">
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'en', label: 'English' },
                  { key: 'hi', label: 'हिंदी' },
                  { key: 'hinglish', label: 'Hinglish' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveLang(tab.key)}
                  className={`flex-1 py-1 rounded-lg font-semibold text-center transition-all cursor-pointer ${
                    activeLang === tab.key
                      ? 'bg-amber-400 text-black shadow-sm font-bold'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Instant Search Bar */}
            <div className="relative mt-2">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-zinc-500">
                <Search className="w-3 h-3 text-amber-400/80" />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search CTA (e.g. follow, share, save, प्रेरणा)..."
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-400 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Preset Options List */}
          <div className="max-h-[300px] overflow-y-auto p-2 space-y-3 divide-y divide-zinc-800/50">
            {groupedPresets.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500 space-y-1">
                <p>No matching CTA headings found.</p>
                <p className="text-[10px] text-zinc-600">Try changing language filter or search query.</p>
              </div>
            ) : (
              groupedPresets.map((group) => {
                const categoryMeta = CTA_CATEGORIES[group.category];
                const IconComponent = CATEGORY_ICONS[group.category] || MessageSquare;

                return (
                  <div key={group.category} className="pt-2 first:pt-0 space-y-1">
                    {/* Category Label */}
                    <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-400/90">
                      <IconComponent className="w-3 h-3 shrink-0" />
                      <span>{categoryMeta.labelEn}</span>
                      <span className="text-zinc-500 font-normal">({categoryMeta.labelHi})</span>
                    </div>

                    {/* Presets in this category */}
                    <div className="space-y-0.5">
                      {group.items.map((preset) => {
                        const isSelected =
                          currentValue.trim().toLowerCase() === preset.text.trim().toLowerCase();

                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => handleSelectPreset(preset)}
                            className={`w-full text-left flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-amber-400/15 text-amber-300 font-semibold border border-amber-400/40'
                                : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                            }`}
                          >
                            <span className="truncate flex-1">{preset.text}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold uppercase ${
                                  preset.language === 'en'
                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                    : preset.language === 'hi'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                }`}
                              >
                                {preset.language === 'en'
                                  ? 'EN'
                                  : preset.language === 'hi'
                                  ? 'हिन्दी'
                                  : 'Hinglish'}
                              </span>
                              {isSelected && <Check className="w-3 h-3 text-amber-400 shrink-0" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Note */}
          <div className="px-3 py-2 bg-zinc-950/90 border-t border-zinc-800 text-[10px] text-zinc-500 flex items-center justify-between">
            <span>Click any option to auto-fill & customize.</span>
            <span className="font-mono text-zinc-600">Reels & Shorts</span>
          </div>
        </div>
      )}
    </div>
  );
};
