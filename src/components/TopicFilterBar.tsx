'use client';

import React from 'react';
import { ArrowUpDown, CheckSquare, Square, Filter, Languages } from 'lucide-react';
import { SortField } from '@/lib/ranking';
import { TopicCategory } from '@/lib/types';

interface TopicFilterBarProps {
  selectedTopic: TopicCategory | 'All';
  onSelectTopic: (topic: TopicCategory | 'All') => void;
  topicCounts: Record<string, number>;
  sortBy: SortField;
  onSortChange: (sortBy: SortField) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  allSelected: boolean;
  totalCandidates: number;
  language?: 'en' | 'hi';
  onLanguageChange?: (lang: 'en' | 'hi') => void;
}

export const TopicFilterBar: React.FC<TopicFilterBarProps> = ({
  selectedTopic,
  onSelectTopic,
  topicCounts,
  sortBy,
  onSortChange,
  onSelectAll,
  onDeselectAll,
  allSelected,
  totalCandidates,
  language = 'en',
  onLanguageChange,
}) => {
  const topics: Array<TopicCategory | 'All'> = [
    'All',
    'Motivation',
    'Philosophy',
    'Self-Respect',
    'Psychology',
    'Relationships',
    'Fear and Courage',
    'Meditation and Awareness',
    'Life Lessons',
    'Stories',
    'Other',
  ];

  return (
    <div className="w-full glass-panel rounded-2xl p-4 border border-white/10 space-y-4">
      {/* Topics row */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-thin">
        <Filter className="w-4 h-4 text-zinc-400 flex-shrink-0 mr-1" />
        {topics.map((t) => {
          const count = t === 'All' ? totalCandidates : topicCounts[t] || 0;
          if (t !== 'All' && count === 0) return null; // hide empty categories

          const isSelected = selectedTopic === t;
          return (
            <button
              key={t}
              onClick={() => onSelectTopic(t)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-white text-zinc-950 font-semibold shadow-md'
                  : 'bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/5'
              }`}
            >
              <span>{t}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-zinc-200 text-zinc-950 font-bold' : 'bg-zinc-800 text-zinc-400'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sorting & Batch Actions row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10 text-xs">
        {/* Sort Controls */}
        <div className="flex items-center space-x-2">
          <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-zinc-400">Sort By:</span>
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortField)}
            className="bg-zinc-900/80 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-white"
          >
            <option value="score">Editorial Score (Highest)</option>
            <option value="confidence">Context Confidence</option>
            <option value="duration">Clip Duration</option>
            <option value="timestamp">Timeline Order</option>
            <option value="topic">Topic Category</option>
          </select>
        </div>

        {/* Global Language Toggle */}
        <div className="flex items-center space-x-1.5">
          <Languages className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-zinc-400 text-xs">Language:</span>
          <div className="flex items-center p-0.5 rounded-lg bg-zinc-900 border border-white/10 text-xs font-semibold">
            <button
              type="button"
              onClick={() => onLanguageChange && onLanguageChange('en')}
              className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                language === 'en'
                  ? 'bg-white text-zinc-950 font-bold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => onLanguageChange && onLanguageChange('hi')}
              className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                language === 'hi'
                  ? 'bg-white text-zinc-950 font-bold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              हिंदी
            </button>
          </div>
        </div>

        {/* Batch Select Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={allSelected ? onDeselectAll : onSelectAll}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
          >
            {allSelected ? (
              <>
                <Square className="w-3.5 h-3.5" />
                <span>Deselect All</span>
              </>
            ) : (
              <>
                <CheckSquare className="w-3.5 h-3.5 text-white" />
                <span>Select All</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
