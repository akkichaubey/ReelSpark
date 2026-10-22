'use client';

import React from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Scissors,
  Share2,
  FolderOpen,
  PlusCircle,
  Trash2,
  ArrowRight,
  Film,
  Clock,
  CheckCircle2,
  HardDrive,
  Cpu,
  Layers,
  Video,
} from 'lucide-react';
import { Project } from '@/lib/types';

interface DashboardViewProps {
  userName: string;
  projects: Project[];
  onOpenProject: (project: Project) => void;
  onDeleteProject: (projectId: string) => void;
  onNewProject: () => void;
  ollamaModel?: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  userName,
  projects,
  onOpenProject,
  onDeleteProject,
  onNewProject,
  ollamaModel = 'llama3.2',
}) => {
  return (
    <div className="space-y-10 animate-in fade-in duration-300">
      {/* ─── Hero Welcome Banner ────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 border border-white/10 p-6 sm:p-10 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-400/10 text-amber-300 border border-amber-400/20">
                Workspace Dashboard
              </span>
              <span className="text-xs text-zinc-400 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-amber-400" />
                <span>Ollama Engine ({ollamaModel})</span>
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Welcome back, <span className="text-amber-400">{userName}</span> 👋
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Create viral animated reels, trim and merge multi-track video clips, and generate high-converting social post captions with 100% free local AI.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onNewProject}
              className="flex items-center space-x-2 px-5 py-3 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-sm shadow-xl shadow-white/10 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>New Project</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── Studio Suite / Quick Launch Cards ──────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Creative Studios
            </h3>
            <p className="text-xs text-zinc-400">Launch any dedicated creation tool</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: AI Caption Maker */}
          <Link
            href="/caption-maker"
            className="group relative rounded-2xl bg-zinc-900/60 hover:bg-zinc-900 border border-white/10 hover:border-amber-400/40 p-6 flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 shadow-lg"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                  <Sparkles className="w-6 h-6" />
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  Most Popular
                </span>
              </div>
              <h4 className="text-base font-bold text-white group-hover:text-amber-300 transition-colors">
                AI Caption Maker
              </h4>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                Word-level timestamped subtitles, viral animation styles (Hormozi, Neon, Pop), karaoke colors, and 9:16 vertical MP4 export.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs font-semibold text-amber-400 group-hover:text-amber-300">
              <span>Open Caption Maker</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Card 2: Clipping Studio */}
          <Link
            href="/clipping-studio"
            className="group relative rounded-2xl bg-zinc-900/60 hover:bg-zinc-900 border border-white/10 hover:border-emerald-400/40 p-6 flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 shadow-lg"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                  <Scissors className="w-6 h-6" />
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                  Fast Stream-Copy
                </span>
              </div>
              <h4 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors">
                Clipping Studio
              </h4>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                Precision frame-accurate cut lists, multi-segment recipe merger, MP3 voice extractor, and instant zero-loss export.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs font-semibold text-emerald-400 group-hover:text-emerald-300">
              <span>Open Clipping Studio</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Card 3: AI Social Post */}
          <Link
            href="/social-post"
            className="group relative rounded-2xl bg-zinc-900/60 hover:bg-zinc-900 border border-white/10 hover:border-sky-400/40 p-6 flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 shadow-lg"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-sky-400/10 border border-sky-400/30 flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform">
                  <Share2 className="w-6 h-6" />
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-400/20 text-sky-300 border border-sky-400/30">
                  Ollama AI Copy
                </span>
              </div>
              <h4 className="text-base font-bold text-white group-hover:text-sky-300 transition-colors">
                AI Social Post
              </h4>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                Generate high-converting opening hooks, post captions, CTAs, and hashtags tailored for Instagram Reels & YouTube Shorts.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs font-semibold text-sky-400 group-hover:text-sky-300">
              <span>Open Social Post</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>
      </div>

      {/* ─── Our Work / Projects Section ────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2.5">
            <FolderOpen className="w-5 h-5 text-amber-400" />
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Our Work
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-300 border border-white/10">
              {projects.length}
            </span>
          </div>

          {projects.length > 0 && (
            <button
              onClick={onNewProject}
              className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Create Another Project</span>
            </button>
          )}
        </div>

        {projects.length === 0 ? (
          /* Clean Empty State */
          <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-900/30 p-10 text-center flex flex-col items-center justify-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 border border-white/10 flex items-center justify-center text-zinc-400">
              <Film className="w-7 h-7" />
            </div>
            <div className="space-y-1 max-w-md">
              <h4 className="text-sm font-bold text-white">No Projects Yet</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                You haven&apos;t created any video projects yet. Click below to start your first project or choose any studio tool from above.
              </p>
            </div>
            <button
              onClick={onNewProject}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs shadow-md transition-all cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Start a New Project</span>
            </button>
          </div>
        ) : (
          /* Projects Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="group rounded-2xl bg-zinc-900/60 border border-white/10 hover:border-white/20 p-5 flex flex-col justify-between transition-all hover:bg-zinc-900 shadow-md"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-300 flex-shrink-0">
                      <Video className="w-4 h-4" />
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                        project.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          : project.status === 'ANALYZING' || project.status === 'TRANSCRIBING'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                          : 'bg-zinc-800 text-zinc-400 border-white/5'
                      }`}
                    >
                      {project.status}
                    </span>
                  </div>

                  <div>
                    <h4
                      onClick={() => onOpenProject(project)}
                      className="font-bold text-sm text-white group-hover:text-amber-300 transition-colors truncate cursor-pointer"
                      title={project.title}
                    >
                      {project.title}
                    </h4>
                    <p className="text-[11px] text-zinc-500 flex items-center gap-1.5 mt-1">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(project.updatedAt || project.createdAt).toLocaleDateString()}</span>
                      {project.candidates?.length > 0 && (
                        <span>• {project.candidates.length} clips discovered</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-white/5 flex items-center justify-between">
                  <button
                    onClick={() => onOpenProject(project)}
                    className="text-xs font-semibold text-white hover:text-amber-400 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>Open Project</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => onDeleteProject(project.id)}
                    className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
                    title="Delete project"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Infrastructure Footprint ───────────────────────────────────── */}
      <div className="p-4 rounded-2xl bg-zinc-900/30 border border-white/5 flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-500">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>FFmpeg Hardware Codecs Ready</span>
          </span>
          <span className="flex items-center gap-1.5 text-zinc-400">
            <HardDrive className="w-3.5 h-3.5 text-amber-400" />
            <span>Cloudflare D1 & R2 Ready</span>
          </span>
        </div>
        <div>
          <span>Local Studio v1.0.0 • 100% Client-Side Privacy</span>
        </div>
      </div>
    </div>
  );
};
