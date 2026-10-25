'use client';

import React, { useState } from 'react';
import { Search, TextSearch } from 'lucide-react';
import { SearchMatch } from '@/lib/types';

interface SemanticSearchBoxProps {
  projectId: string;
  onJumpToTimestamp?: (start: number, end: number) => void;
  onCreateClipFromSearch?: (start: number, end: number, text: string) => void;
}

export const SemanticSearchBox: React.FC<SemanticSearchBoxProps> = ({
  projectId,
  onJumpToTimestamp,
  onCreateClipFromSearch,
}) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [searched, setSearched] = useState(false);

  const sampleQueries = [
    'Find the strongest moments where Osho explains fear and self-respect',
    'Drop all fear in the present moment',
    'Meditation and awareness without judgment',
    'Courage to move into the unknown',
  ];

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    try {
      setIsSearching(true);
      setSearched(true);
      const res = await fetch(`/api/projects/${projectId}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      });

      const data = await res.json();
      if (data.success) {
        setResults(data.matches || []);
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full glass-panel rounded-2xl p-5 border border-white/10 space-y-4">
      <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
        <TextSearch className="w-4 h-4 text-zinc-200" />
        <span>Semantic Transcript Search</span>
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSearch(query);
        }}
        className="flex items-center gap-2"
      >
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Find the strongest moments where Osho explains fear and self-respect..."
            className="w-full px-4 py-2.5 pl-10 rounded-xl bg-zinc-900/70 border border-white/10 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-white focus:ring-1 focus:ring-white/20 transition-colors"
          />
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3.5" />
        </div>
        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 disabled:opacity-50 text-zinc-950 font-semibold text-sm transition-all shadow-sm"
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </form>

      {/* Preset Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">Suggestions:</span>
        {sampleQueries.map((q, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setQuery(q);
              handleSearch(q);
            }}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-white/5 transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Results Dropdown / List */}
      {searched && (
        <div className="pt-2 border-t border-white/10 space-y-2.5 max-h-60 overflow-y-auto">
          {results.length === 0 ? (
            <p className="text-xs text-zinc-400 italic">No exact matches found for this query in the full transcript.</p>
          ) : (
            results.map((r, i) => (
              <div
                key={i}
                className="p-3 rounded-xl bg-zinc-900/60 border border-white/5 hover:border-white/20 flex items-start justify-between gap-3 text-xs transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-white font-mono">
                      {formatTime(r.start)} - {formatTime(r.end)}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold text-[10px] border border-white/20">
                      {r.relevanceScore}% match
                    </span>
                  </div>
                  <p className="text-zinc-200">{r.snippet}</p>
                  <p className="text-[11px] text-zinc-500">{r.contextNote}</p>
                </div>
                <div className="flex items-center space-x-1.5 flex-shrink-0">
                  {onJumpToTimestamp && (
                    <button
                      type="button"
                      onClick={() => onJumpToTimestamp(r.start, r.end)}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                    >
                      Jump to Time
                    </button>
                  )}
                  {onCreateClipFromSearch && (
                    <button
                      type="button"
                      onClick={() => onCreateClipFromSearch(r.start, r.end, r.snippet)}
                      className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 font-semibold transition-colors"
                    >
                      Add Clip
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
