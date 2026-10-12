'use client';

import React from 'react';
import {
  Mic,
  BrainCircuit,
  ShieldCheck,
  Award,
  CheckCircle2,
  Loader2,
  Clock,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Project } from '@/lib/types';

interface AnalysisProgressCardProps {
  project: Project;
}

export const AnalysisProgressCard: React.FC<AnalysisProgressCardProps> = ({ project }) => {
  const status = project.status;
  const progress = Math.max(5, Math.min(100, project.progress || 0));
  const message = project.statusMessage || 'Processing media...';

  // Determine active pipeline stage (1 to 4)
  let currentStage = 1;
  if (status === 'TRANSCRIBING') currentStage = 1;
  else if (status === 'ANALYZING') currentStage = 2;
  else if (status === 'VERIFYING') currentStage = 3;
  else if (status === 'RANKING') currentStage = 4;
  else if (status === 'COMPLETED') currentStage = 4;

  // Extract section numbers if present (e.g. "Analyzing section 8 of 23")
  const sectionMatch = message.match(/section\s+(\d+)\s+of\s+(\d+)/i);
  const currentSection = sectionMatch ? sectionMatch[1] : null;
  const totalSections = sectionMatch ? sectionMatch[2] : null;

  // Extract timeframe if present (e.g. "1050s - 1230s")
  const timeMatch = message.match(/\((\d+)s\s*-\s*(\d+)s\)/);
  const timeRange = timeMatch
    ? `${Math.floor(parseInt(timeMatch[1], 10) / 60)}m - ${Math.floor(parseInt(timeMatch[2], 10) / 60)}m`
    : null;

  const stages = [
    {
      id: 1,
      title: 'Speech Transcription',
      desc: 'Audio extraction & timestamped transcription',
      icon: Mic,
      statusKey: 'TRANSCRIBING',
    },
    {
      id: 2,
      title: 'Semantic Video Analysis',
      desc: totalSections
        ? `Section ${currentSection || 1} of ${totalSections} (${timeRange || 'in progress'})`
        : 'Scanning 180s sections for viral & philosophical hooks',
      icon: BrainCircuit,
      statusKey: 'ANALYZING',
    },
    {
      id: 3,
      title: 'Context Verification',
      desc: 'Validating standalone thoughts & pronoun safety',
      icon: ShieldCheck,
      statusKey: 'VERIFYING',
    },
    {
      id: 4,
      title: 'Editorial Ranking',
      desc: '7-factor quality scoring & duplicate elimination',
      icon: Award,
      statusKey: 'RANKING',
    },
  ];

  return (
    <div className="w-full glass-panel rounded-2xl border border-white/10 p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden bg-gradient-to-b from-zinc-900/90 to-zinc-950/90">
      {/* Background ambient glow */}
      <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header with Title and Live Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="text-xs font-bold tracking-widest text-emerald-400 uppercase">
              Live AI Analysis Pipeline
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>Analyzing Video Content</span>
            <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
          </h3>
        </div>

        {/* Big percentage counter */}
        <div className="flex items-baseline space-x-1.5 self-start sm:self-auto bg-white/5 px-4 py-2 rounded-2xl border border-white/10">
          <span className="text-3xl font-black text-white tracking-tight">{progress}</span>
          <span className="text-sm font-semibold text-zinc-400">%</span>
        </div>
      </div>

      {/* Main Animated Progress Bar */}
      <div className="space-y-2.5">
        <div className="w-full h-3.5 rounded-full bg-zinc-950 border border-white/10 overflow-hidden p-0.5 shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-rose-500 via-indigo-500 via-sky-400 to-emerald-400 rounded-full transition-all duration-700 ease-out relative"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
          </div>
        </div>

        {/* Live Status Message text */}
        <div className="flex items-center justify-between text-xs text-zinc-300">
          <p className="flex items-center space-x-2 font-medium">
            <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin flex-shrink-0" />
            <span className="text-white font-semibold">{message}</span>
          </p>
          <span className="text-zinc-500 hidden sm:inline">Auto-refreshing in real-time</span>
        </div>
      </div>

      {/* 4-Stage Visual Stepper */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
        {stages.map((stage) => {
          const isDone = stage.id < currentStage;
          const isActive = stage.id === currentStage;
          const Icon = stage.icon;

          return (
            <div
              key={stage.id}
              className={`p-4 rounded-xl border transition-all duration-300 relative ${
                isActive
                  ? 'bg-white/10 border-sky-400/40 shadow-lg shadow-sky-500/10'
                  : isDone
                  ? 'bg-zinc-900/60 border-emerald-500/30 text-zinc-300'
                  : 'bg-zinc-900/30 border-white/5 text-zinc-500 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isActive
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                      : isDone
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>

                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : isActive ? (
                  <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
                ) : (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                    Step {stage.id}
                  </span>
                )}
              </div>

              <h4
                className={`text-sm font-semibold mb-1 ${
                  isActive ? 'text-white' : isDone ? 'text-zinc-200' : 'text-zinc-400'
                }`}
              >
                {stage.title}
              </h4>
              <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                {stage.desc}
              </p>
            </div>
          );
        })}
      </div>

      {/* Footer Info Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5 text-xs text-zinc-400">
        <div className="flex flex-wrap items-center gap-3">
          {project.videoMetadata && (
            <span className="flex items-center space-x-1.5 bg-zinc-900/80 px-2.5 py-1 rounded-lg border border-white/5">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span>
                Length: {Math.round(project.videoMetadata.duration)}s (
                {(project.videoMetadata.duration / 60).toFixed(1)} mins)
              </span>
            </span>
          )}

          {totalSections && (
            <span className="flex items-center space-x-1.5 bg-zinc-900/80 px-2.5 py-1 rounded-lg border border-white/5 text-indigo-400">
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              <span>
                Section: {currentSection || 1} of {totalSections}
              </span>
            </span>
          )}

          <span className="bg-zinc-900/80 px-2.5 py-1 rounded-lg border border-white/5 text-zinc-300">
            Engine: Gemini 2.5 Flash
          </span>
        </div>

        <span className="text-[11px] text-zinc-500 italic">
          High-precision AI analysis discovers viral moments under 60 seconds
        </span>
      </div>
    </div>
  );
};
