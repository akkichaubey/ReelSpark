'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, ShieldAlert, Sparkles } from 'lucide-react';
import {
  CaptionGroup,
  CaptionStyle,
  ImageAsset,
  OutputSettings,
  TranscriptWord,
} from '@/lib/caption-maker/types';

interface CaptionPreviewProps {
  image?: ImageAsset;
  audioUrl?: string;
  transcript: TranscriptWord[];
  captionGroups: CaptionGroup[];
  captionStyle: CaptionStyle;
  outputSettings: OutputSettings;
  currentTime: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  totalDuration: number;
}

export const CaptionPreview: React.FC<CaptionPreviewProps> = ({
  image,
  audioUrl,
  transcript,
  captionGroups,
  captionStyle,
  outputSettings,
  currentTime,
  isPlaying,
  onTogglePlay,
  totalDuration,
}) => {
  const [isMuted, setIsMuted] = useState(false);

  // Active word and active caption group identification based on currentTime
  const activeWord = transcript.find(
    (w) => currentTime >= w.start && currentTime <= w.end
  );

  const activeGroup = captionGroups.find(
    (g) => currentTime >= g.start && currentTime <= g.end
  );

  // Fallback: nearest word within 0.3s
  const displayWord =
    activeWord ||
    transcript.find(
      (w) => Math.abs(currentTime - w.start) < 0.25 || Math.abs(currentTime - w.end) < 0.25
    );

  const displayGroup =
    activeGroup ||
    captionGroups.find(
      (g) => Math.abs(currentTime - g.start) < 0.3 || Math.abs(currentTime - g.end) < 0.3
    );

  // Aspect ratio calculation
  const getAspectRatioClasses = () => {
    switch (outputSettings.preset) {
      case 'instagram-reel':
      case 'youtube-short':
        return 'aspect-[9/16] max-h-[580px]';
      case 'instagram-portrait':
        return 'aspect-[4/5] max-h-[500px]';
      case 'instagram-square':
        return 'aspect-square max-h-[460px]';
      case 'youtube-landscape':
        return 'aspect-[16/9] max-h-[400px]';
      default:
        return 'aspect-[9/16] max-h-[580px]';
    }
  };

  // Vertical position styling
  const getPositionStyles = (): React.CSSProperties => {
    if (captionStyle.position === 'top') {
      return { top: '18%', left: '50%', transform: 'translate(-50%, -50%)' };
    }
    if (captionStyle.position === 'center') {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }
    if (captionStyle.position === 'bottom') {
      return { bottom: '18%', left: '50%', transform: 'translate(-50%, 50%)' };
    }
    return {
      top: `${captionStyle.customY ?? 50}%`,
      left: `${captionStyle.customX ?? 50}%`,
      transform: 'translate(-50%, -50%)',
    };
  };

  return (
    <div className="flex flex-col items-center justify-center w-full">
      <div
        className={`relative rounded-2xl overflow-hidden border border-white/15 bg-black shadow-2xl flex items-center justify-center select-none ${getAspectRatioClasses()} w-full max-w-sm sm:max-w-md mx-auto group`}
      >
        {/* 1. Background Image Layer */}
        {image ? (
          image.fitMode === 'blur' ? (
            <div className="absolute inset-0 overflow-hidden">
              {/* Blurred background */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.fileUrl}
                alt="blur-bg"
                className="w-full h-full object-cover filter blur-xl scale-110 opacity-70"
              />
              {/* Sharp contained foreground */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.fileUrl}
                alt="sharp-fg"
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.fileUrl}
              alt="bg"
              className={`w-full h-full ${
                image.fitMode === 'contain' ? 'object-contain bg-black' : 'object-cover'
              }`}
            />
          )
        ) : (
          <div className="text-center p-6 text-zinc-500 flex flex-col items-center space-y-2">
            <Sparkles className="w-8 h-8 text-zinc-600 animate-pulse" />
            <p className="text-xs font-semibold text-zinc-400">Upload background image to preview</p>
            <p className="text-[10px] text-zinc-600">Reel canvas will render here</p>
          </div>
        )}

        {/* 2. Safe Area Guides Overlay */}
        {captionStyle.showSafeArea && (
          <div className="absolute inset-x-6 inset-y-12 border-2 border-dashed border-sky-400/35 rounded-xl pointer-events-none z-10 flex flex-col justify-between p-2">
            <span className="text-[9px] font-mono text-sky-400/80 bg-sky-950/70 px-1.5 py-0.5 rounded self-start">
              SAFE AREA TOP
            </span>
            <span className="text-[9px] font-mono text-sky-400/80 bg-sky-950/70 px-1.5 py-0.5 rounded self-end">
              REEL UI SAFE ZONE
            </span>
          </div>
        )}

        {/* 3. Real-Time Animated Caption Layer */}
        <div
          style={getPositionStyles()}
          className="absolute z-20 pointer-events-none text-center max-w-[88%] transition-all"
        >
          {captionStyle.captionMode === 'word-by-word' ? (
            // Mode 1: Word-by-Word Solo Display
            displayWord && (
              <div
                style={{
                  fontFamily: captionStyle.fontFamily,
                  fontSize: `${captionStyle.fontSize * 0.45}px`,
                  fontWeight:
                    captionStyle.fontWeight === 'bold' || captionStyle.fontWeight === 'black'
                      ? 900
                      : 700,
                  color: displayWord.isImportant
                    ? captionStyle.importantColor
                    : captionStyle.textColor,
                  WebkitTextStroke: `${captionStyle.strokeWidth * 0.4}px ${captionStyle.strokeColor}`,
                  textShadow: `0px 4px ${captionStyle.shadowBlur}px ${captionStyle.shadowColor}`,
                  backgroundColor: captionStyle.backgroundColor,
                  padding: `${(captionStyle.backgroundPadding ?? 10) * 0.4}px ${(captionStyle.backgroundPadding ?? 10) * 0.8}px`,
                  borderRadius: '12px',
                }}
                className={`inline-block transition-transform duration-75 ${
                  displayWord.isImportant || captionStyle.animationPreset === 'pop'
                    ? 'scale-110 drop-shadow-xl animate-in zoom-in-75 duration-100'
                    : 'scale-100'
                }`}
              >
                {captionStyle.uppercase ? displayWord.text.toUpperCase() : displayWord.text}
              </div>
            )
          ) : (
            // Mode 2 & Mode 3: Phrase Highlight
            displayGroup && (
              <div
                style={{
                  fontFamily: captionStyle.fontFamily,
                  fontSize: `${captionStyle.fontSize * 0.38}px`,
                  fontWeight:
                    captionStyle.fontWeight === 'bold' || captionStyle.fontWeight === 'black'
                      ? 900
                      : 700,
                  WebkitTextStroke: `${captionStyle.strokeWidth * 0.35}px ${captionStyle.strokeColor}`,
                  textShadow: `0px 3px ${captionStyle.shadowBlur}px ${captionStyle.shadowColor}`,
                  backgroundColor: captionStyle.backgroundColor,
                  padding: `${(captionStyle.backgroundPadding ?? 10) * 0.35}px ${(captionStyle.backgroundPadding ?? 10) * 0.7}px`,
                  borderRadius: '14px',
                }}
                className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 leading-snug"
              >
                {displayGroup.words.map((w) => {
                  const isCurrent = displayWord?.id === w.id;
                  const wordText = captionStyle.uppercase ? w.text.toUpperCase() : w.text;

                  const color = isCurrent
                    ? w.isImportant
                      ? captionStyle.importantColor
                      : captionStyle.textColor
                    : `${captionStyle.textColor}80`; // 50% opacity when inactive

                  return (
                    <span
                      key={w.id}
                      style={{
                        color,
                      }}
                      className={`transition-all duration-75 inline-block ${
                        isCurrent
                          ? 'scale-115 font-black text-amber-300 drop-shadow-lg'
                          : 'scale-100'
                      }`}
                    >
                      {wordText}
                    </span>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* 4. Center Play/Pause Clickable Overlay */}
        <button
          type="button"
          onClick={onTogglePlay}
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        >
          <div className="p-4 rounded-full bg-white/90 text-zinc-950 shadow-2xl hover:scale-110 transition-transform">
            {isPlaying ? (
              <Pause className="w-6 h-6 fill-current" />
            ) : (
              <Play className="w-6 h-6 fill-current ml-0.5" />
            )}
          </div>
        </button>

        {/* 5. Audio Player Element (Controlled by parent) */}
        {audioUrl && (
          <audio
            src={audioUrl}
            muted={isMuted}
            className="hidden"
          />
        )}
      </div>

      {/* Preset & Time Badge underneath preview */}
      <div className="flex items-center justify-between w-full max-w-sm sm:max-w-md pt-2 px-1 text-xs text-zinc-400 font-mono">
        <span className="capitalize">{outputSettings.preset.replace('-', ' ')}</span>
        <span className="text-zinc-200">
          {currentTime.toFixed(1)}s / {totalDuration.toFixed(1)}s
        </span>
      </div>
    </div>
  );
};
