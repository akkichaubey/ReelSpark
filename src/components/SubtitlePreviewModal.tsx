'use client';

import React, { useState } from 'react';
import { X, Subtitles, Copy, Check } from 'lucide-react';
import { ClipCandidate, Project, SubtitleStyle } from '@/lib/types';
import { generateSrtForClip } from '@/lib/srt';

interface SubtitlePreviewModalProps {
  project: Project;
  candidate: ClipCandidate | null;
  onUpdateStyle: (style: SubtitleStyle) => void;
  onClose: () => void;
}

export const SubtitlePreviewModal: React.FC<SubtitlePreviewModalProps> = ({
  project,
  candidate,
  onUpdateStyle,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [style, setStyle] = useState<SubtitleStyle>(project.settings.subtitleStyle);

  if (!candidate) return null;

  const srtContent = generateSrtForClip(project.transcript, candidate.start, candidate.end);

  const handleCopy = () => {
    navigator.clipboard.writeText(srtContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStyleChange = (updates: Partial<SubtitleStyle>) => {
    const next = { ...style, ...updates };
    setStyle(next);
    onUpdateStyle(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl glass-panel rounded-2xl overflow-hidden border border-white/10 shadow-2xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center space-x-2">
            <Subtitles className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-bold text-white tracking-tight">Subtitle Preview & Styling</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Visual Canvas Preview */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase text-zinc-400">
            Rendered Preview Frame (9:16 Reel Simulation)
          </label>
          <div className="relative w-full h-44 bg-zinc-950 rounded-xl border border-white/10 overflow-hidden flex items-center justify-center shadow-inner">
            {/* Background simulation */}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/50 to-zinc-950/40 opacity-70" />

            {/* Subtitle Box positioned according to style.verticalPosition */}
            <div
              className={`absolute left-6 right-6 text-center transition-all ${
                style.verticalPosition === 'top'
                  ? 'top-4'
                  : style.verticalPosition === 'middle'
                  ? 'top-1/2 -translate-y-1/2'
                  : 'bottom-4'
              }`}
            >
              <span
                style={{
                  fontSize: `${style.fontSize}px`,
                  color: style.fontColor,
                  textShadow: `
                    -${style.outlineWidth}px -${style.outlineWidth}px 0 ${style.outlineColor},
                     ${style.outlineWidth}px -${style.outlineWidth}px 0 ${style.outlineColor},
                    -${style.outlineWidth}px  ${style.outlineWidth}px 0 ${style.outlineColor},
                     ${style.outlineWidth}px  ${style.outlineWidth}px 0 ${style.outlineColor}
                  `,
                }}
                className="font-bold leading-tight tracking-wide drop-shadow-md select-none inline-block px-3 py-1"
              >
                &ldquo;{candidate.firstWords} ... {candidate.lastWords}&rdquo;
              </span>
            </div>
          </div>
        </div>

        {/* Style Controls */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-zinc-900/60 border border-white/10 text-xs">
          {/* Font Size */}
          <div>
            <label className="block text-zinc-400 mb-1">Font Size ({style.fontSize}px)</label>
            <input
              type="range"
              min="18"
              max="44"
              value={style.fontSize}
              onChange={(e) => handleStyleChange({ fontSize: parseInt(e.target.value, 10) })}
              className="w-full accent-amber-400 cursor-pointer"
            />
          </div>

          {/* Vertical Position */}
          <div>
            <label className="block text-zinc-400 mb-1">Position</label>
            <select
              value={style.verticalPosition}
              onChange={(e) => handleStyleChange({ verticalPosition: e.target.value as any })}
              className="w-full bg-zinc-800 border border-white/10 rounded-lg p-1.5 text-white"
            >
              <option value="bottom">Bottom</option>
              <option value="middle">Middle</option>
              <option value="top">Top</option>
            </select>
          </div>

          {/* Font Color */}
          <div>
            <label className="block text-zinc-400 mb-1">Font Color</label>
            <div className="flex items-center space-x-2">
              <input
                type="color"
                value={style.fontColor}
                onChange={(e) => handleStyleChange({ fontColor: e.target.value })}
                className="w-7 h-7 rounded border-0 bg-transparent cursor-pointer"
              />
              <span className="font-mono text-zinc-300">{style.fontColor}</span>
            </div>
          </div>

          {/* Outline Color */}
          <div>
            <label className="block text-zinc-400 mb-1">Outline Color</label>
            <div className="flex items-center space-x-2">
              <input
                type="color"
                value={style.outlineColor}
                onChange={(e) => handleStyleChange({ outlineColor: e.target.value })}
                className="w-7 h-7 rounded border-0 bg-transparent cursor-pointer"
              />
              <span className="font-mono text-zinc-300">{style.outlineColor}</span>
            </div>
          </div>
        </div>

        {/* SRT Text Editor / Preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold uppercase text-zinc-400">
              Generated SRT (Offset Synchronized to Clip 00:00:00)
            </span>
            <button
              onClick={handleCopy}
              className="flex items-center space-x-1 text-zinc-400 hover:text-white"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy SRT'}</span>
            </button>
          </div>
          <pre className="p-3.5 rounded-xl bg-zinc-950 border border-white/10 text-xs font-mono text-emerald-300/90 max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed">
            {srtContent}
          </pre>
        </div>

        <div className="flex justify-end pt-2 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
