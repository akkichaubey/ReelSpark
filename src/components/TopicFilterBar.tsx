'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import React from 'react';
import { ArrowUpDown, CheckSquare, Square, Filter, Languages, ChevronDown } from 'lucide-react';
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
    <div className="w-full glass-panel rounded-2xl p-5 border border-white/10 space-y-5">
      {/* Topics row */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-thin">
        <Filter className="w-4 h-4 text-zinc-400 flex-shrink-0 mr-1" />
        {topics.map((t) => {
          const count = t === 'All' ? totalCandidates : topicCounts[t] || 0;
          if (t !== 'All' && count === 0) return null; // hide empty categories

          const isSelected = selectedTopic === t;
          return (
            <Button
              key={t}
              onClick={() => onSelectTopic(t)}
              className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-amber-400 text-zinc-950 font-semibold shadow-sm'
                  : 'bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/5'
              }`}
            >
              <span>{t}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-zinc-200 text-zinc-950 font-bold' : 'bg-zinc-800 text-zinc-400'}`}>
                {count}
              </span>
            </Button>
          );
        })}
      </div>

      {/* Sorting & Batch Actions row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10 text-xs">
        {/* Sort Controls */}
        <div className="flex items-center space-x-2">
          <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-zinc-400">Sort By:</span>
          <div className="w-52">
            <Select value={sortBy} onValueChange={(val) => onSortChange(val as SortField)}>
              <SelectTrigger aria-label="Sort clips" className="min-h-10 bg-zinc-950/70 border-white/15 text-zinc-100 text-xs hover:border-amber-400/40">
                <SelectValue placeholder="Sort clips" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800 text-white min-w-[13rem]">
                <SelectItem value="score">Editorial Score (Highest)</SelectItem>
                <SelectItem value="confidence">Context Confidence</SelectItem>
                <SelectItem value="duration">Clip Duration</SelectItem>
                <SelectItem value="timestamp">Timeline Order</SelectItem>
                <SelectItem value="topic">Topic Category</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Global Language Toggle */}
        <div className="flex items-center space-x-1.5">
          <Languages className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-zinc-400 text-xs">Language:</span>
          <div className="flex items-center p-0.5 rounded-lg bg-zinc-900 border border-white/10 text-xs font-semibold">
            <Button
              type="button"
              onClick={() => onLanguageChange && onLanguageChange('en')}
              className={`min-h-9 px-3 rounded-md transition-all cursor-pointer ${
                language === 'en'
                  ? 'bg-zinc-700 text-white font-bold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              English
            </Button>
            <Button
              type="button"
              onClick={() => onLanguageChange && onLanguageChange('hi')}
              className={`min-h-9 px-3 rounded-md transition-all cursor-pointer ${
                language === 'hi'
                  ? 'bg-zinc-700 text-white font-bold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              हिंदी
            </Button>
          </div>
        </div>

        {/* Batch Select Controls */}
        <div className="flex items-center space-x-2">
          <Button
            disabled={totalCandidates === 0} onClick={allSelected ? onDeselectAll : onSelectAll}
            className="flex items-center space-x-2 min-h-10 px-3.5 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
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
          </Button>
        </div>
      </div>
    </div>
  );
};
