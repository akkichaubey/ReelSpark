'use strict';
'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  CaptionGroup,
  TranscriptWord,
} from '@/lib/caption-maker/types';
import {
  splitCaptionGroup,
  mergeCaptionGroups,
  updateWordInGroups,
  deleteWordFromGroups,
  addWordToGroup,
  deleteCaptionGroup,
  updateCaptionGroupPhrase,
  addCaptionGroup,
} from '@/lib/caption-maker/caption-grouping';
import {
  detectImportantWords,
} from '@/lib/caption-maker/important-words';
import {
  AudioLines,
  Loader2,
  ScanSearch,
  Split,
  Merge,
  Trash2,
  Plus,
  Play,
  Check,
  Edit2,
  Search,
  Star,
  X,
  Clock,
  Compass,
} from 'lucide-react';

interface TranscriptEditorProps {
  groups: CaptionGroup[];
  currentTime: number;
  onUpdateGroups: (groups: CaptionGroup[]) => void;
  onSeek: (seconds: number) => void;
  onClearAll?: () => void;
  onAutoDetectTranscript?: () => void;
  isTranscribing?: boolean;
  className?: string;
}

export const TranscriptEditor: React.FC<TranscriptEditorProps> = ({
  groups,
  currentTime,
  onUpdateGroups,
  onSeek,
  onClearAll,
  onAutoDetectTranscript,
  isTranscribing = false,
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  // Phrase-level group editing
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupText, setEditGroupText] = useState('');
  const [editGroupStart, setEditGroupStart] = useState('');
  const [editGroupEnd, setEditGroupEnd] = useState('');

  // Auto-scroll toggle
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const activeGroupRef = useRef<HTMLDivElement | null>(null);

  const formatSec = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${s
      .toString()
      .padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // Auto-scroll active group into view during playback
  useEffect(() => {
    if (!autoScroll || editingWordId || editingGroupId || !activeGroupRef.current) return;
    activeGroupRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, [currentTime, autoScroll, editingWordId, editingGroupId]);

  // Word-level editing handlers
  const startEditWord = (word: TranscriptWord) => {
    setEditingGroupId(null);
    setEditingWordId(word.id);
    setEditText(word.text);
    setEditStart(word.start.toFixed(2));
    setEditEnd(word.end.toFixed(2));
  };

  const saveEditWord = (wordId: string) => {
    const startVal = parseFloat(editStart);
    const endVal = parseFloat(editEnd);
    const updated = updateWordInGroups(groups, wordId, {
      text: editText.trim() || 'word',
      start: isNaN(startVal) ? 0 : Math.max(0, startVal),
      end: isNaN(endVal) ? 1 : Math.max(startVal + 0.05, endVal),
    });
    onUpdateGroups(updated);
    setEditingWordId(null);
  };

  const handleToggleImportance = (word: TranscriptWord) => {
    const updated = updateWordInGroups(groups, word.id, {
      isImportant: !word.isImportant,
    });
    onUpdateGroups(updated);
  };

  const handleDeleteWord = (wordId: string) => {
    const updated = deleteWordFromGroups(groups, wordId);
    onUpdateGroups(updated);
    if (editingWordId === wordId) setEditingWordId(null);
  };

  const handleAddWordAfter = (group: CaptionGroup, afterWordId: string) => {
    const afterWord = group.words.find((w) => w.id === afterWordId);
    const newStart = afterWord ? afterWord.end : group.end;
    const newEnd = Number((newStart + 0.4).toFixed(2));
    const newWord: TranscriptWord = {
      id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: 'NewWord',
      start: Number(newStart.toFixed(2)),
      end: newEnd,
      isImportant: false,
    };
    const updated = addWordToGroup(groups, group.id, afterWordId, newWord);
    onUpdateGroups(updated);
    startEditWord(newWord);
  };

  // Phrase-level group editing handlers
  const startEditGroup = (group: CaptionGroup) => {
    setEditingWordId(null);
    setEditingGroupId(group.id);
    setEditGroupText(group.text);
    setEditGroupStart(group.start.toFixed(2));
    setEditGroupEnd(group.end.toFixed(2));
  };

  const saveEditGroup = (groupId: string) => {
    const startVal = parseFloat(editGroupStart);
    const endVal = parseFloat(editGroupEnd);
    const cleanText = editGroupText.trim();
    if (!cleanText) {
      // If cleared, delete group
      handleDeleteGroup(groupId);
      return;
    }
    const updated = updateCaptionGroupPhrase(
      groups,
      groupId,
      cleanText,
      isNaN(startVal) ? undefined : Math.max(0, startVal),
      isNaN(endVal) ? undefined : Math.max(startVal + 0.2, endVal)
    );
    onUpdateGroups(updated);
    setEditingGroupId(null);
  };

  const handleDeleteGroup = (groupId: string) => {
    const updated = deleteCaptionGroup(groups, groupId);
    onUpdateGroups(updated);
    if (editingGroupId === groupId) setEditingGroupId(null);
  };

  const handleSplitGroup = (group: CaptionGroup, wordIndex: number) => {
    if (wordIndex <= 0 || wordIndex >= group.words.length) return;
    const updated = splitCaptionGroup(groups, group.id, wordIndex);
    onUpdateGroups(updated);
  };

  const handleMergeWithNext = (groupIndex: number) => {
    if (groupIndex >= groups.length - 1) return;
    const updated = mergeCaptionGroups(
      groups,
      groups[groupIndex].id,
      groups[groupIndex + 1].id
    );
    onUpdateGroups(updated);
  };

  // Add brand-new caption phrase
  const handleAddNewPhrase = (afterGroupId: string | null = null) => {
    let start = 0;
    let end = 2.5;

    if (afterGroupId) {
      const g = groups.find((grp) => grp.id === afterGroupId);
      if (g) {
        start = Number((g.end + 0.1).toFixed(2));
        end = Number((start + 2.4).toFixed(2));
      }
    } else if (groups.length > 0) {
      const last = groups[groups.length - 1];
      start = Number((last.end + 0.1).toFixed(2));
      end = Number((start + 2.4).toFixed(2));
    } else if (currentTime > 0) {
      start = Number(currentTime.toFixed(2));
      end = Number((start + 2.5).toFixed(2));
    }

    const updated = addCaptionGroup(
      groups,
      afterGroupId,
      'New caption phrase goes here',
      start,
      end
    );
    onUpdateGroups(updated);

    // Automatically open edit mode on the newly added group
    const newGroup = updated.find(
      (g) => !groups.some((existing) => existing.id === g.id)
    );
    if (newGroup) {
      startEditGroup(newGroup);
    }
  };

  // Re-run AI keyword detector across all words (force recompute)
  const handleAutoDetectAll = () => {
    const updated = groups.map((g) => {
      const wordsWithAI = detectImportantWords(g.words, true);
      return {
        ...g,
        words: wordsWithAI,
      };
    });
    onUpdateGroups(updated);
  };

  const totalWords = groups.reduce((acc, g) => acc + g.words.length, 0);
  const importantCount = groups.reduce(
    (acc, g) => acc + g.words.filter((w) => w.isImportant).length,
    0
  );

  return (
    <div className={`flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl ${className}`}>
      {/* Header & Controls */}
      <div className="p-3 bg-zinc-950/80 border-b border-zinc-800 space-y-2.5 shrink-0">
        {/* Row 1: Title and Status Badges */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-zinc-100 text-sm tracking-tight whitespace-nowrap">
              Transcript & Captions
            </h3>
            <button
              type="button"
              onClick={() => setAutoScroll((prev) => !prev)}
              title={autoScroll ? 'Auto-scroll is ON during playback' : 'Auto-scroll is OFF'}
              className={`p-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                autoScroll
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Compass className="w-3 h-3" />
              <span className="text-[10px] font-mono leading-none">{autoScroll ? 'Sync' : 'Manual'}</span>
            </button>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full font-mono whitespace-nowrap border border-zinc-700/60 shadow-sm leading-none flex items-center">
              {totalWords} words
            </span>
            <span className="text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono whitespace-nowrap flex items-center gap-1 shadow-sm leading-none">
              <Star className="w-3 h-3 fill-amber-400 shrink-0" />
              <span>{importantCount} highlighted</span>
            </span>
          </div>
        </div>

        {/* Subtitle / Tip */}
        <p className="text-[11px] text-zinc-400 leading-snug">
          Click words or edit entire phrases. Audio stays perfectly synchronized.
        </p>

        {/* Row 2: Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {onAutoDetectTranscript && (
            <button
              type="button"
              onClick={onAutoDetectTranscript}
              disabled={isTranscribing}
              title="Automatically detect spoken words from audio using AI"
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shadow-sm cursor-pointer active:scale-95 whitespace-nowrap ${
                isTranscribing
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                  : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-zinc-950 font-bold'
              }`}
            >
              {isTranscribing ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" /> : <AudioLines className="w-3.5 h-3.5 shrink-0" />}
              <span>{isTranscribing ? 'AI Transcribing...' : 'Auto-Detect Speech (AI)'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleAutoDetectAll}
            title="Auto-detect emotional/motivational keywords"
            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold rounded-lg transition-colors shadow-sm cursor-pointer active:scale-95 whitespace-nowrap"
          >
            <ScanSearch className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span>Detect Keywords</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddNewPhrase(null)}
            title="Add a new caption phrase"
            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-semibold rounded-lg transition-colors shadow-sm cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span>Add Phrase</span>
          </button>
          {groups.length > 0 && onClearAll && (
            <button
              type="button"
              onClick={onClearAll}
              title="Delete all transcript words and captions"
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold rounded-lg transition-colors shadow-sm cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Input */}
      <div className="px-3.5 py-2 bg-zinc-900/60 border-b border-zinc-800/80 flex items-center gap-2 shrink-0">
        <Search className="w-4 h-4 text-zinc-500 shrink-0" />
        <input
          type="text"
          placeholder="Filter words or phrases..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent text-xs text-zinc-200 placeholder-zinc-500 w-full focus:outline-none"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* Transcript Groups List */}
      <div
        ref={listContainerRef}
        className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar min-h-0"
      >
        {groups.length === 0 ? (
          <div className="text-center py-10 px-4 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/30 flex flex-col items-center justify-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center text-amber-400 border border-zinc-800 shadow-sm">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-zinc-300 font-semibold text-sm">No captions in project yet</p>
              <p className="text-zinc-500 text-xs mt-1 max-w-xs mx-auto">
                Detect spoken words automatically with AI, or add your first phrase manually.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {onAutoDetectTranscript && (
                <button
                  type="button"
                  onClick={onAutoDetectTranscript}
                  disabled={isTranscribing}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer active:scale-95"
                >
                  {isTranscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : <AudioLines className="w-4 h-4" />}
                  <span>{isTranscribing ? 'AI Transcribing Audio...' : 'Auto-Detect Transcript (AI)'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleAddNewPhrase(null)}
                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 border border-zinc-700 shadow-sm transition-all cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4 text-amber-400" />
                <span>Add Phrase Manually</span>
              </button>
            </div>
          </div>
        ) : (
          groups.map((group, groupIdx) => {
            const isGroupActive =
              currentTime >= group.start && currentTime <= group.end;
            const matchesSearch =
              !searchQuery ||
              group.text.toLowerCase().includes(searchQuery.toLowerCase());

            if (!matchesSearch) return null;

            const isEditingGroup = editingGroupId === group.id;

            return (
              <div
                key={group.id}
                ref={isGroupActive ? activeGroupRef : null}
                className={`p-2.5 rounded-lg border transition-all ${
                  isGroupActive
                    ? 'bg-zinc-800/90 border-amber-500/50 shadow-md ring-1 ring-amber-500/20'
                    : 'bg-zinc-950/40 border-zinc-800/90 hover:border-zinc-700/80'
                }`}
              >
                {/* Group Meta & Action Header */}
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5 border-b border-zinc-800/60 pb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => onSeek(group.start)}
                      title="Jump to caption start"
                      className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors shrink-0 cursor-pointer"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                    </button>
                    <span className="font-mono text-[11px] text-zinc-400 whitespace-nowrap shrink-0">
                      {formatSec(group.start)} → {formatSec(group.end)}
                    </span>
                    <span className="text-[10px] bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-400 shrink-0">
                      #{groupIdx + 1}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Phrase edit */}
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditingGroup) {
                          saveEditGroup(group.id);
                        } else {
                          startEditGroup(group);
                        }
                      }}
                      title={isEditingGroup ? 'Save phrase' : 'Edit phrase'}
                      className={`p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer ${
                        isEditingGroup ? 'text-amber-400 font-bold' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {isEditingGroup ? <Check className="w-3 h-3" /> : <Edit2 className="w-3 h-3" />}
                    </button>

                    {groupIdx < groups.length - 1 && !isEditingGroup && (
                      <button
                        type="button"
                        onClick={() => handleMergeWithNext(groupIdx)}
                        title="Merge with next caption group"
                        className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                      >
                        <Merge className="w-3 h-3" />
                        <span className="hidden sm:inline">Merge</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDeleteGroup(group.id)}
                      title="Delete caption phrase"
                      className="p-1 rounded hover:bg-rose-500/10 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Phrase-level Inline Editor (Full sentence mode) */}
                {isEditingGroup ? (
                  <div className="space-y-1.5 bg-zinc-950/80 p-2 rounded-lg border border-amber-500/50">
                    <textarea
                      value={editGroupText}
                      onChange={(e) => setEditGroupText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          saveEditGroup(group.id);
                        } else if (e.key === 'Escape') {
                          setEditingGroupId(null);
                        }
                      }}
                      autoFocus
                      rows={2}
                      placeholder="Type caption phrase..."
                      className="w-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 p-1.5 rounded focus:outline-none focus:border-amber-400 resize-none font-sans"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                      <div className="flex items-center gap-1 text-[11px] text-zinc-400">
                        <span className="font-mono text-zinc-500">Timing:</span>
                        <input
                          type="number"
                          step="0.05"
                          value={editGroupStart}
                          onChange={(e) => setEditGroupStart(e.target.value)}
                          className="w-12 bg-zinc-900 border border-zinc-700 px-1 py-0.5 rounded text-zinc-200 font-mono text-[11px]"
                          title="Start time in seconds"
                        />
                        <span className="text-zinc-600">→</span>
                        <input
                          type="number"
                          step="0.05"
                          value={editGroupEnd}
                          onChange={(e) => setEditGroupEnd(e.target.value)}
                          className="w-12 bg-zinc-900 border border-zinc-700 px-1 py-0.5 rounded text-zinc-200 font-mono text-[11px]"
                          title="End time in seconds"
                        />
                        <span className="text-zinc-500">s</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingGroupId(null)}
                          className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEditGroup(group.id)}
                          className="px-2 py-0.5 rounded bg-amber-400 hover:bg-amber-300 text-black text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Words Chips Container */
                  <div className="flex flex-wrap items-center gap-1.5">
                    {group.words.map((word, wordIdx) => {
                      const isWordActive =
                        currentTime >= word.start && currentTime <= word.end;
                      const isEditing = editingWordId === word.id;

                      if (isEditing) {
                        return (
                          <div
                            key={word.id}
                            className="flex items-center gap-1 bg-zinc-950 p-1.5 rounded-lg border border-amber-500 shadow-md animate-in fade-in z-20"
                          >
                            <input
                              type="text"
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEditWord(word.id);
                                if (e.key === 'Escape') setEditingWordId(null);
                              }}
                              onBlur={() => saveEditWord(word.id)}
                              autoFocus
                              className="bg-zinc-900 border border-zinc-700 text-xs text-white px-2 py-0.5 rounded focus:outline-none focus:border-amber-400 w-24"
                            />
                            <div className="flex items-center gap-0.5 text-[10px] text-zinc-400">
                              <input
                                type="number"
                                step="0.05"
                                value={editStart}
                                onChange={(e) => setEditStart(e.target.value)}
                                className="w-12 bg-zinc-900 border border-zinc-800 px-1 py-0.5 rounded text-zinc-300 font-mono text-[10px] focus:outline-none focus:border-amber-400"
                              />
                              <span>-</span>
                              <input
                                type="number"
                                step="0.05"
                                value={editEnd}
                                onChange={(e) => setEditEnd(e.target.value)}
                                className="w-12 bg-zinc-900 border border-zinc-800 px-1 py-0.5 rounded text-zinc-300 font-mono text-[10px] focus:outline-none focus:border-amber-400"
                              />
                            </div>
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                saveEditWord(word.id);
                              }}
                              className="p-1 rounded bg-amber-500 text-black hover:bg-amber-400 transition-colors cursor-pointer"
                              title="Save changes (Enter)"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setEditingWordId(null);
                              }}
                              className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors cursor-pointer"
                              title="Cancel (Esc)"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={word.id}
                          className={`group/chip relative inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors select-none ${
                            isWordActive
                              ? 'bg-amber-400 text-black font-bold shadow-md shadow-amber-400/20'
                              : word.isImportant
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                              : 'bg-zinc-800/80 text-zinc-300 border border-zinc-700/60 hover:bg-zinc-700/80 hover:text-white'
                          }`}
                        >
                          <span
                            onClick={() => onSeek(word.start)}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              startEditWord(word);
                            }}
                            title={`Click to seek (${formatSec(word.start)}), Double-click to edit`}
                            className="select-none"
                          >
                            {word.text}
                          </span>

                          {/* Toggle Important Star */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleImportance(word);
                            }}
                            title={
                              word.isImportant
                                ? 'Remove highlight'
                                : 'Mark as emphasized word'
                            }
                            className={`p-0.5 rounded hover:scale-110 transition-transform cursor-pointer ${
                              word.isImportant
                                ? 'text-amber-400'
                                : 'text-zinc-500 hover:text-amber-400'
                            }`}
                          >
                            <Star
                              className={`w-3 h-3 ${
                                word.isImportant ? 'fill-current' : ''
                              }`}
                            />
                          </button>

                          {/* Floating Quick Action Toolbar */}
                          <div className="absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 hidden group-hover/chip:flex items-center gap-0.5 px-1.5 py-0.5 bg-zinc-900/95 backdrop-blur-md border border-zinc-700/90 rounded-md shadow-xl shadow-black/80 z-30 whitespace-nowrap animate-in fade-in zoom-in-95 duration-100 before:absolute before:inset-x-0 before:top-full before:h-2.5 before:content-['']">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditWord(word);
                              }}
                              title="Edit text & timing (or double-click word)"
                              className="p-1 hover:text-white hover:bg-zinc-800 rounded text-zinc-300 transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            {wordIdx < group.words.length - 1 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSplitGroup(group, wordIdx + 1);
                                }}
                                title="Split group after this word"
                                className="p-1 hover:text-amber-400 hover:bg-zinc-800 rounded text-zinc-300 transition-colors cursor-pointer"
                              >
                                <Split className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddWordAfter(group, word.id);
                              }}
                              title="Add word after"
                              className="p-1 hover:text-emerald-400 hover:bg-zinc-800 rounded text-zinc-300 transition-colors cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteWord(word.id);
                              }}
                              title="Delete word"
                              className="p-1 hover:text-rose-400 hover:bg-zinc-800 rounded text-zinc-300 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Bottom "+ Add Phrase" shortcut when groups exist */}
        {groups.length > 0 && (
          <div className="pt-2 flex justify-center">
            <button
              type="button"
              onClick={() => handleAddNewPhrase(null)}
              className="px-3 py-1.5 rounded-lg border border-dashed border-zinc-700/80 hover:border-amber-500/50 text-zinc-400 hover:text-amber-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>Add Caption Phrase At End</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
