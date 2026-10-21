'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  Scissors,
  Plus,
  Trash2,
  HelpCircle,
  Edit2,
  Sparkles,
  Copy,
  Check,
  Clock,
  Filter,
  Play,
  Pause,
} from 'lucide-react';
import { useClippingStore } from '@/lib/clipping-studio/use-clipping-store';
import {
  parseBulkTimestamps,
  formatMsToTimestamp,
  ParsedBulkClip,
} from '@/lib/clipping-studio/contracts';

const SAMPLE_BULK_INPUT = `00:00:10.000 to 00:00:25.000 | Opening Hook
00:01:15 to 00:01:45 | Core Philosophy
00:02:30.500 to 00:03:10.000 | Thought Provoking Quote
00:04:10 - 00:04:40 | Actionable Takeaway`;

export const BulkTimestampEditor: React.FC = () => {
  const {
    activeProject,
    selectedAssetId,
    currentTimeMs,
    setCurrentTimeMs,
    setInPoint,
    setOutPoint,
    createClipsBulk,
    auditionRangeAction,
    auditionRange,
    isPlaying,
  } = useClippingStore();

  const [rawText, setRawText] = useState('');
  const [createdCount, setCreatedCount] = useState<number | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [tableFilter, setTableFilter] = useState<'all' | 'valid' | 'invalid'>('all');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const selectedAsset = activeProject?.mediaAssets.find((a) => a.id === selectedAssetId);
  const maxDurationMs = selectedAsset?.metadata?.durationMs;

  // Real-time parsing of all input lines
  const parseResult = useMemo(() => {
    if (!rawText.trim()) {
      return { items: [], validCount: 0, invalidCount: 0 };
    }
    return parseBulkTimestamps(rawText, maxDurationMs);
  }, [rawText, maxDurationMs]);

  const lines = useMemo(() => {
    return rawText.split('\n');
  }, [rawText]);

  const filteredItems = useMemo(() => {
    if (tableFilter === 'valid') return parseResult.items.filter((i) => i.valid);
    if (tableFilter === 'invalid') return parseResult.items.filter((i) => !i.valid);
    return parseResult.items;
  }, [parseResult.items, tableFilter]);

  const handleCommitBulkClips = () => {
    const validItems = parseResult.items.filter((item) => item.valid);
    if (validItems.length === 0) return;

    createClipsBulk(
      validItems.map((item) => ({
        name: item.name,
        startMs: item.startMs,
        endMs: item.endMs,
        durationMs: item.durationMs,
      }))
    );

    setCreatedCount(validItems.length);
    setRawText('');
    setTimeout(() => setCreatedCount(null), 4000);
  };

  const handleLoadSample = () => {
    setRawText(SAMPLE_BULK_INPUT);
    setCreatedCount(null);
  };

  const handleAddPreset = (startMs: number, endMs: number, label: string) => {
    const safeEnd = maxDurationMs ? Math.min(endMs, maxDurationMs) : endMs;
    const startStr = formatMsToTimestamp(startMs);
    const endStr = formatMsToTimestamp(safeEnd);
    const newLine = `${startStr} to ${endStr} | ${label}`;
    setRawText((prev) => (prev.trim() ? `${prev.trim()}\n${newLine}` : newLine));
  };

  const handleAddFromPlayhead = (durationSec: number, label: string) => {
    const startMs = currentTimeMs;
    const endMs = startMs + durationSec * 1000;
    handleAddPreset(startMs, endMs, label);
  };

  const handleCopySummary = () => {
    const validLines = parseResult.items
      .filter((i) => i.valid)
      .map((i) => `${formatMsToTimestamp(i.startMs)} to ${formatMsToTimestamp(i.endMs)} | ${i.name}`)
      .join('\n');

    if (validLines) {
      navigator.clipboard.writeText(validLines);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    }
  };

  const handleAuditionLine = (item: ParsedBulkClip) => {
    if (!item.valid) return;
    const isLinePlaying =
      isPlaying &&
      auditionRange !== null &&
      auditionRange.startMs === item.startMs &&
      auditionRange.endMs === item.endMs;
    const mediaEl = typeof document !== 'undefined'
      ? document.querySelector<HTMLMediaElement>('#clipping-studio-player-media')
      : null;

    if (isLinePlaying) {
      if (mediaEl && !mediaEl.paused) {
        mediaEl.pause();
      }
    } else if (mediaEl) {
      mediaEl.currentTime = item.startMs / 1000;
      const playPromise = mediaEl.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => console.warn('[Direct Click Play]', err));
      }
    }

    auditionRangeAction(item.startMs, item.endMs);
  };

  // Sync gutter scroll with textarea
  const handleScroll = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  return (
    <div className="rounded-2xl bg-zinc-950 border border-white/10 p-5 space-y-6 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
        <div>
          <h3 className="text-base font-bold text-white flex items-center space-x-2">
            <FileText className="w-4 h-4 text-amber-400" />
            <span>Bulk Timestamp Range Editor</span>
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Paste multiple timestamp ranges (one per line) with optional names to generate many clips in a single operation.
          </p>
        </div>

        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          <button
            type="button"
            onClick={handleLoadSample}
            className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium border border-white/10 transition-colors cursor-pointer"
          >
            Insert Sample Ranges
          </button>
          <button
            type="button"
            onClick={handleCopySummary}
            disabled={parseResult.validCount === 0}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 text-zinc-300 text-xs font-medium border border-white/10 transition-colors cursor-pointer"
            title="Copy valid range text to clipboard"
          >
            {copiedSummary ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedSummary ? 'Copied' : 'Copy Text'}</span>
          </button>
          <button
            type="button"
            onClick={() => setRawText('')}
            disabled={!rawText}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Clear all text"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Preset Buttons Bar */}
      <div className="flex items-center flex-wrap gap-2 text-xs">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center space-x-1 mr-1">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Quick Inserts:</span>
        </span>

        <button
          type="button"
          onClick={() => handleAddFromPlayhead(15, 'Intro Hook')}
          className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 text-[11px] font-medium flex items-center space-x-1 transition-colors cursor-pointer"
          title={`Insert 15s range starting at current playhead (${formatMsToTimestamp(currentTimeMs)})`}
        >
          <Clock className="w-3 h-3 text-amber-400" />
          <span>+15s from Playhead</span>
        </button>

        <button
          type="button"
          onClick={() => handleAddFromPlayhead(30, 'Key Insight')}
          className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 text-[11px] font-medium flex items-center space-x-1 transition-colors cursor-pointer"
          title={`Insert 30s range starting at current playhead (${formatMsToTimestamp(currentTimeMs)})`}
        >
          <Clock className="w-3 h-3 text-amber-400" />
          <span>+30s from Playhead</span>
        </button>

        <button
          type="button"
          onClick={() => handleAddFromPlayhead(60, 'Core Segment')}
          className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 text-[11px] font-medium flex items-center space-x-1 transition-colors cursor-pointer"
          title={`Insert 60s range starting at current playhead (${formatMsToTimestamp(currentTimeMs)})`}
        >
          <Clock className="w-3 h-3 text-amber-400" />
          <span>+60s from Playhead</span>
        </button>

        <button
          type="button"
          onClick={() => handleAddPreset(0, 15000, 'Opening Hook')}
          className="px-2.5 py-1 rounded-lg bg-zinc-900/60 hover:bg-zinc-900 border border-white/5 text-zinc-400 hover:text-zinc-200 text-[11px] transition-colors cursor-pointer"
        >
          Start Hook [00:00:00 → 00:00:15]
        </button>
      </div>

      {/* Input Code Editor & Format Documentation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Text Area with Line Number Gutter */}
        <div className="lg:col-span-2 space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Paste Ranges (One Range Per Line)
          </label>

          <div className="relative flex rounded-xl bg-zinc-900 border border-white/15 focus-within:border-amber-400/80 transition-colors overflow-hidden">
            {/* Gutter */}
            <div
              ref={gutterRef}
              className="w-10 select-none bg-zinc-950/80 border-r border-white/10 py-3 text-center font-mono text-xs text-zinc-600 overflow-hidden leading-relaxed"
            >
              {(lines.length > 0 ? lines : ['']).map((_, idx) => (
                <div key={idx} className="h-5">
                  {idx + 1}
                </div>
              ))}
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                setCreatedCount(null);
              }}
              onScroll={handleScroll}
              placeholder={`00:00:10.000 to 00:00:20.000\n00:01:15 to 00:01:35 | Opening Hook\n00:02:40.000 to 00:03:10.000`}
              rows={8}
              className="flex-1 px-3.5 py-3 bg-transparent text-white font-mono text-xs placeholder-zinc-600 focus:outline-none leading-relaxed resize-y overflow-y-auto"
            />
          </div>
        </div>

        {/* Documentation Helper */}
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/10 space-y-3 text-xs flex flex-col justify-between">
          <div className="space-y-2.5">
            <span className="font-bold text-white flex items-center space-x-1.5 text-xs">
              <HelpCircle className="w-4 h-4 text-amber-400" />
              <span>Supported Range Formats</span>
            </span>
            <ul className="space-y-1.5 text-zinc-400 text-[11px]">
              <li className="flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span><code className="text-zinc-200 bg-zinc-800 px-1 py-0.5 rounded">00:01:15 to 00:01:35</code></span>
              </li>
              <li className="flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span><code className="text-zinc-200 bg-zinc-800 px-1 py-0.5 rounded">01:15 - 01:35</code> (MM:SS)</span>
              </li>
              <li className="flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span><code className="text-zinc-200 bg-zinc-800 px-1 py-0.5 rounded">00:00:10.500 to 00:00:20.250</code></span>
              </li>
              <li className="flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>Title pipe: <code className="text-amber-300 bg-zinc-800 px-1 py-0.5 rounded">| Clip Name</code></span>
              </li>
            </ul>
          </div>

          <div className="pt-2 border-t border-white/5 text-[11px] text-zinc-500">
            Validated line-by-line with millisecond fidelity. Malformed or reversed lines show explicit diagnostics below without blocking valid clips.
          </div>
        </div>
      </div>

      {/* Real-Time Parsed Preview Table */}
      {parseResult.items.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2 text-xs">
              <span className="font-bold text-white">Parsed Line Preview</span>

              {/* Status Counters / Filters */}
              <button
                type="button"
                onClick={() => setTableFilter('all')}
                className={`px-2 py-0.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                  tableFilter === 'all'
                    ? 'bg-zinc-800 text-white border-white/20'
                    : 'text-zinc-400 border-transparent hover:text-zinc-200'
                }`}
              >
                All ({parseResult.items.length})
              </button>

              <button
                type="button"
                onClick={() => setTableFilter('valid')}
                className={`px-2 py-0.5 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                  tableFilter === 'valid'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                }`}
              >
                {parseResult.validCount} Valid
              </button>

              {parseResult.invalidCount > 0 && (
                <button
                  type="button"
                  onClick={() => setTableFilter('invalid')}
                  className={`px-2 py-0.5 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                    tableFilter === 'invalid'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}
                >
                  {parseResult.invalidCount} Invalid
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleCommitBulkClips}
              disabled={parseResult.validCount === 0 || !selectedAssetId}
              className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-white hover:bg-zinc-200 disabled:opacity-50 text-zinc-950 font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Create {parseResult.validCount} Valid Clips</span>
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-zinc-900/40">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900 border-b border-white/10 text-zinc-400 text-[11px] uppercase">
                <tr>
                  <th className="py-2.5 px-3 w-12 text-center">Line</th>
                  <th className="py-2.5 px-3 w-24">Status</th>
                  <th className="py-2.5 px-3">Clip Name</th>
                  <th className="py-2.5 px-3 font-mono">Start Time</th>
                  <th className="py-2.5 px-3 font-mono">End Time</th>
                  <th className="py-2.5 px-3 font-mono">Duration</th>
                  <th className="py-2.5 px-3 w-20 text-right">Audition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredItems.map((item, idx) => (
                  <tr
                    key={idx}
                    className={`transition-colors ${
                      item.valid ? 'hover:bg-zinc-900/80' : 'bg-rose-500/5 hover:bg-rose-500/10'
                    }`}
                  >
                    <td className="py-2 px-3 text-center text-zinc-500 font-mono text-[11px]">
                      {item.lineNumber}
                    </td>
                    <td className="py-2 px-3">
                      {item.valid ? (
                        <span className="inline-flex items-center space-x-1 text-emerald-400 font-semibold text-[11px]">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Ready</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-rose-400 font-semibold text-[11px]">
                          <AlertCircle className="w-3 h-3" />
                          <span>Error</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {item.valid ? (
                        <span className="font-medium text-white">{item.name}</span>
                      ) : (
                        <span className="text-rose-300/90 text-[11px] font-medium">{item.error}</span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono text-zinc-300">
                      {item.valid ? formatMsToTimestamp(item.startMs) : '—'}
                    </td>
                    <td className="py-2 px-3 font-mono text-zinc-300">
                      {item.valid ? formatMsToTimestamp(item.endMs) : '—'}
                    </td>
                    <td className="py-2 px-3 font-mono text-amber-300 font-bold">
                      {item.valid ? formatMsToTimestamp(item.durationMs) : '—'}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {item.valid && (
                        (() => {
                          const isLinePlaying =
                            isPlaying &&
                            auditionRange !== null &&
                            auditionRange.startMs === item.startMs &&
                            auditionRange.endMs === item.endMs;
                          return (
                            <button
                              type="button"
                              onClick={() => handleAuditionLine(item)}
                              title={isLinePlaying ? 'Pause audition' : 'Audition range in timeline & player'}
                              className={`p-1.5 rounded transition-colors cursor-pointer ${
                                isLinePlaying
                                  ? 'bg-amber-400 text-zinc-950 font-bold shadow-sm shadow-amber-400/30'
                                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white'
                              }`}
                            >
                              {isLinePlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                            </button>
                          );
                        })()
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Toast */}
      {createdCount !== null && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center space-x-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Successfully created {createdCount} clips and added to project library!</span>
        </div>
      )}
    </div>
  );
};
