'use strict';
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  TranscriptWord,
  CaptionGroup,
  AudioAsset,
  FillerSegment,
} from '@/lib/caption-maker/types';
import {
  detectSilencesAndFillers,
  calculateSavedDuration,
  analyzeClipHighlights,
  autoMarkViralHighlights,
  ClipHighlightAnalysis,
} from '@/lib/caption-maker/smart-editor';
import {
  X,
  Scissors,
  Zap,
  Flame,
  CheckCircle2,
  Clock,
  Gauge,
  Sliders,
  Check,
  Target,
  Star,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface SmartEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  words: TranscriptWord[];
  captionGroups: CaptionGroup[];
  totalDuration: number;
  audio?: AudioAsset;
  fillerSegments?: FillerSegment[];
  onApplyTrimmedAudio?: (data: {
    audioUrl: string;
    storagePath?: string;
    duration: number;
    transcript: TranscriptWord[];
    captionGroups: CaptionGroup[];
  }) => void;
  onUpdateWords?: (words: TranscriptWord[]) => void;
  onSetTrimRange?: (range: { start: number; end: number }) => void;
}

export const SmartEditorModal: React.FC<SmartEditorModalProps> = ({
  isOpen,
  onClose,
  words,
  captionGroups,
  totalDuration,
  audio,
  fillerSegments = [],
  onApplyTrimmedAudio,
  onUpdateWords,
  onSetTrimRange,
}) => {
  const [activeTab, setActiveTab] = useState<'silence' | 'highlights'>('silence');
  const [minPauseDuration, setMinPauseDuration] = useState<number>(0.6);
  const [detectFillers, setDetectFillers] = useState<boolean>(true);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isApplyingTrim, setIsApplyingTrim] = useState<boolean>(false);
  const [trimError, setTrimError] = useState<string | null>(null);
  const [highlightToast, setHighlightToast] = useState<string | null>(null);

  // 1. Compute detected silence and filler gaps dynamically based on slider threshold
  const detectedGaps: FillerSegment[] = useMemo(() => {
    // If pre-existing fillerSegments from transcription exists and matches, we can combine or compute fresh
    const computed = detectSilencesAndFillers(words, totalDuration, {
      minPauseDuration,
      detectFillers,
    });
    return computed;
  }, [words, totalDuration, minPauseDuration, detectFillers]);

  // Initialize selected indices to all detected gaps whenever detected gaps change
  useEffect(() => {
    if (detectedGaps.length > 0) {
      setSelectedIndices(new Set(detectedGaps.map((_, idx) => idx)));
    } else {
      setSelectedIndices(new Set());
    }
  }, [detectedGaps]);

  const selectedGaps = useMemo(() => {
    return detectedGaps.filter((_, idx) => selectedIndices.has(idx));
  }, [detectedGaps, selectedIndices]);

  const savedDuration = useMemo(() => {
    return calculateSavedDuration(selectedGaps);
  }, [selectedGaps]);

  // 2. Compute Clip Highlight & Viral Retention Analysis
  const highlightAnalysis: ClipHighlightAnalysis = useMemo(() => {
    return analyzeClipHighlights(words, totalDuration, captionGroups);
  }, [words, totalDuration, captionGroups]);

  if (!isOpen) return null;

  const toggleSelectGap = (index: number) => {
    const next = new Set(selectedIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelectedIndices(next);
  };

  const handleSelectAll = (select: boolean) => {
    if (select) {
      setSelectedIndices(new Set(detectedGaps.map((_, idx) => idx)));
    } else {
      setSelectedIndices(new Set());
    }
  };

  // 3. Apply Server-side Jump-Cut via /api/caption-maker/trim-fillers
  const handleApplyJumpCut = async () => {
    if (!audio || selectedGaps.length === 0) return;
    setIsApplyingTrim(true);
    setTrimError(null);

    try {
      const payload = {
        storagePath: audio.storagePath,
        fileUrl: audio.fileUrl,
        fillerSegments: selectedGaps,
        transcript: words,
      };

      const res = await fetch('/api/caption-maker/trim-fillers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Server audio trimming failed');
      }

      if (onApplyTrimmedAudio) {
        onApplyTrimmedAudio({
          audioUrl: data.audioUrl,
          storagePath: data.storagePath,
          duration: data.duration,
          transcript: data.transcript,
          captionGroups: data.captionGroups,
        });
      }

      onClose();
    } catch (err: any) {
      setTrimError(err.message || 'Failed to trim silence gaps');
    } finally {
      setIsApplyingTrim(false);
    }
  };

  // 4. Auto-Mark Viral Keywords in Transcript
  const handleAutoMarkHighlights = () => {
    if (!onUpdateWords) return;
    const updated = autoMarkViralHighlights(words, highlightAnalysis.punchlineWords);
    onUpdateWords(updated);
    setHighlightToast(`★ Marked ${highlightAnalysis.punchlineWords.length} viral keywords!`);
    setTimeout(() => setHighlightToast(null), 3000);
  };

  // 5. Snap Trim Range to Golden Hook Window
  const handleSnapToHook = () => {
    if (!onSetTrimRange) return;
    onSetTrimRange({
      start: highlightAnalysis.hookInterval.start,
      end: highlightAnalysis.hookInterval.end,
    });
    setHighlightToast(`🎯 Snapped trim handles to Hook (0.0s - ${highlightAnalysis.hookInterval.end.toFixed(1)}s)!`);
    setTimeout(() => setHighlightToast(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-zinc-950/80 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <Scissors className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-100 text-sm">
                AI Smart Editing & Silence Studio
              </h3>
              <p className="text-[11px] text-zinc-400">
                Automatic Dead-Air Cutting & Viral Hook Analytics
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-zinc-800 bg-zinc-950/40 p-1.5 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('silence')}
            className={`flex-1 py-2 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'silence'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <Scissors className="w-3.5 h-3.5 text-amber-400" />
            <span>Silence & Pause Trimmer ({detectedGaps.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('highlights')}
            className={`flex-1 py-2 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'highlights'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-orange-400" />
            <span>Viral Hook & Highlights ({highlightAnalysis.overallViralScore}/100)</span>
          </button>
        </div>

        {/* Toast Notification */}
        {highlightToast && (
          <div className="mx-6 mt-3 p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{highlightToast}</span>
          </div>
        )}

        {/* Error Notification */}
        {trimError && (
          <div className="mx-6 mt-3 p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{trimError}</span>
          </div>
        )}

        {/* Tab 1: Silence & Pause Auto-Trimmer */}
        {activeTab === 'silence' && (
          <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar text-xs">
            {/* Threshold Controls Card */}
            <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-zinc-200 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pause Duration Threshold</span>
                </span>
                <span className="font-mono text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  ≥ {minPauseDuration.toFixed(1)}s
                </span>
              </div>

              <input
                type="range"
                min="0.3"
                max="1.5"
                step="0.1"
                value={minPauseDuration}
                onChange={(e) => setMinPauseDuration(parseFloat(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
              />

              <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                <span>0.3s (Tight/Rapid)</span>
                <span>0.6s (Recommended)</span>
                <span>1.5s (Long Only)</span>
              </div>

              <label className="flex items-center gap-2 pt-2 border-t border-zinc-800/80 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={detectFillers}
                  onChange={(e) => setDetectFillers(e.target.checked)}
                  className="accent-amber-400 rounded w-4 h-4 cursor-pointer"
                />
                <span className="text-zinc-300">
                  Detect verbal fillers (&ldquo;umm&rdquo;, &ldquo;uhh&rdquo;, &ldquo;matlab&rdquo;, &ldquo;like&rdquo;)
                </span>
              </label>
            </div>

            {/* Selection Status & Batch Controls */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-zinc-200">
                  {detectedGaps.length} Gaps Detected
                </span>
                <span className="font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">
                  Saves ~{savedDuration}s of dead-air
                </span>
              </div>

              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => handleSelectAll(true)}
                  className="text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-zinc-600">•</span>
                <button
                  type="button"
                  onClick={() => handleSelectAll(false)}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Detected Gaps List */}
            {detectedGaps.length === 0 ? (
              <div className="p-8 text-center bg-zinc-950/40 border border-zinc-800/80 rounded-xl space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <h4 className="font-semibold text-zinc-200">No Awkward Pauses Detected</h4>
                <p className="text-zinc-400 text-[11px]">
                  Your speech flows tightly at the current {minPauseDuration}s threshold.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                {detectedGaps.map((gap, idx) => {
                  const isSelected = selectedIndices.has(idx);
                  const gapDur = (gap.end - gap.start).toFixed(2);
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleSelectGap(idx)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/50 text-white'
                          : 'bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-amber-400 border-amber-400 text-black'
                              : 'border-zinc-700 bg-zinc-900'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <div>
                          <div className="font-semibold text-xs flex items-center gap-1.5">
                            <span className="capitalize">{gap.text}</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-mono uppercase ${
                                gap.type === 'filler'
                                  ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                  : 'bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              {gap.type || 'pause'}
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono">
                            {gap.start.toFixed(2)}s → {gap.end.toFixed(2)}s
                          </div>
                        </div>
                      </div>

                      <span className="font-mono text-xs font-bold text-amber-400">
                        -{gapDur}s
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Action Bar */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleApplyJumpCut}
                disabled={isApplyingTrim || selectedGaps.length === 0}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-98 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isApplyingTrim ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Trimming & Re-aligning Captions...</span>
                  </>
                ) : (
                  <>
                    <Scissors className="w-4 h-4" />
                    <span>
                      Apply Jump-Cut ({selectedGaps.length} Gaps • Save ~{savedDuration}s)
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Viral Hook & Highlight Studio */}
        {activeTab === 'highlights' && (
          <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar text-xs">
            {/* Overall Viral Meter */}
            <div className="p-4 bg-gradient-to-r from-orange-950/40 via-amber-950/40 to-zinc-950/60 border border-amber-500/30 rounded-xl flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs uppercase tracking-wider">
                  <Flame className="w-4 h-4 text-orange-400" />
                  <span>AI Reel Viral Retention Score</span>
                </div>
                <div className="text-zinc-300 text-[11px] mt-0.5">
                  Calculated from hook punchiness, speech pacing & keyword intensity
                </div>
              </div>

              <div className="text-right">
                <span className="text-2xl font-black font-mono text-amber-400">
                  {highlightAnalysis.overallViralScore}
                </span>
                <span className="text-xs text-zinc-400 font-mono">/100</span>
              </div>
            </div>

            {/* Score Breakdown Grid */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 uppercase font-medium">Hook Strength</span>
                <div className="text-base font-bold text-amber-300 font-mono mt-1">
                  {highlightAnalysis.hookScore}%
                </div>
                <span className="text-[9px] text-zinc-500">First 4 seconds</span>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 uppercase font-medium">Speech Tempo</span>
                <div className="text-base font-bold text-emerald-300 font-mono mt-1">
                  {highlightAnalysis.wpm} WPM
                </div>
                <span className="text-[9px] text-zinc-500">Pacing Score {highlightAnalysis.pacingScore}%</span>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 uppercase font-medium">Retention</span>
                <div className="text-base font-bold text-cyan-300 font-mono mt-1">
                  {highlightAnalysis.retentionScore}%
                </div>
                <span className="text-[9px] text-zinc-500">Punch word density</span>
              </div>
            </div>

            {/* Golden Hook Section */}
            <div className="p-3.5 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-amber-400" />
                  <span>Golden Hook Window ({highlightAnalysis.hookInterval.start.toFixed(1)}s - {highlightAnalysis.hookInterval.end.toFixed(1)}s)</span>
                </span>
                <button
                  type="button"
                  onClick={handleSnapToHook}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-semibold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Target className="w-3 h-3" />
                  <span>Snap Trim Handles to Hook</span>
                </button>
              </div>

              <p className="text-zinc-300 bg-zinc-900/90 p-2.5 rounded-lg border border-zinc-800 font-mono text-[11px] leading-relaxed italic">
                &ldquo;{highlightAnalysis.hookInterval.text}&rdquo;
              </p>
            </div>

            {/* Viral Keywords & Auto-Mark Action */}
            <div className="p-3.5 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-amber-400" />
                  <span>Impact Punchline Keywords ({highlightAnalysis.punchlineWords.length})</span>
                </span>
                <button
                  type="button"
                  onClick={handleAutoMarkHighlights}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 text-black hover:bg-amber-400 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                >
                  <Star className="w-3 h-3 fill-black" />
                  <span>★ Auto-Highlight in Captions</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {highlightAnalysis.punchlineWords.map((word, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold font-mono text-[10px]"
                  >
                    ★ {word}
                  </span>
                ))}
              </div>
            </div>

            {/* Actionable Feedback Pills */}
            <div className="space-y-1.5">
              <span className="font-semibold text-zinc-300 block">AI Editing Recommendations:</span>
              {highlightAnalysis.feedback.map((f, i) => (
                <div
                  key={i}
                  className="p-2 rounded-lg bg-zinc-950/50 border border-zinc-800 text-[11px] text-zinc-300 leading-snug"
                >
                  {f}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
