'use client';

import React, { useState } from 'react';
import {
  FolderPlus,
  Copy,
  Trash2,
  Edit2,
  Play,
  Film,
  Scissors,
  Layers,
  Download,
  Server,
  Database,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useClippingStore } from '@/lib/clipping-studio/use-clipping-store';

export const ProjectDashboard: React.FC = () => {
  const {
    projects,
    activeProject,
    selectProject,
    createProject,
    deleteProject,
    duplicateProject,
    renameProject,
    mediaServiceStatus,
    supabaseStatus,
    setActiveTab,
  } = useClippingStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    createProject(newProjectName.trim(), newProjectDesc.trim());
    setNewProjectName('');
    setNewProjectDesc('');
    setShowCreateModal(false);
  };

  const handleRename = (projectId: string) => {
    if (editName.trim()) {
      renameProject(projectId, editName.trim());
    }
    setEditingProjectId(null);
  };

  const ffmpegAvailable = mediaServiceStatus?.ffmpeg?.available;
  const ffprobeAvailable = mediaServiceStatus?.ffprobe?.available;

  return (
    <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center space-x-3">
            <span>Video & Audio Clipping Studio</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold">
              Desktop DAW Studio
            </span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Local-first clipping, bulk timestamp extraction, arbitrary multi-recipe merging, and verified FFmpeg batch exporting backed by Supabase & local storage.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-sm shadow-lg shadow-white/5 transition-all cursor-pointer"
        >
          <FolderPlus className="w-4 h-4 text-zinc-900" />
          <span>New Clipping Project</span>
        </button>
      </div>

      {/* Service Infrastructure & Health Diagnostics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Local Media Service Engine */}
        <div className="p-5 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                <Server className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Local Media Processing Engine</h3>
                <p className="text-xs text-zinc-400">127.0.0.1 on your PC (FFmpeg & FFprobe)</p>
              </div>
            </div>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-md border flex items-center space-x-1 ${
                ffmpegAvailable && ffprobeAvailable
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${ffmpegAvailable ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span>{ffmpegAvailable && ffprobeAvailable ? 'Operational' : 'Fallback / Internal'}</span>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs bg-zinc-950/60 p-3 rounded-xl border border-white/5">
            <div>
              <span className="text-zinc-500 block text-[10px] uppercase font-semibold">FFmpeg</span>
              <span className="text-zinc-200 truncate block font-mono text-[11px]" title={mediaServiceStatus?.ffmpeg?.version}>
                {mediaServiceStatus?.ffmpeg?.version || (ffmpegAvailable ? 'Detected' : 'Not Found')}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[10px] uppercase font-semibold">FFprobe</span>
              <span className="text-zinc-200 truncate block font-mono text-[11px]" title={mediaServiceStatus?.ffprobe?.version}>
                {mediaServiceStatus?.ffprobe?.version || (ffprobeAvailable ? 'Detected' : 'Not Found')}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500">
            Runs safely via argument arrays with no shell interpolation. Start the standalone daemon anytime with <code className="text-amber-400 bg-zinc-800 px-1 py-0.5 rounded">pnpm media-service</code>.
          </p>
        </div>

        {/* Card 2: Supabase Metadata & Local Storage Sync */}
        <div className="p-5 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center border border-sky-500/20">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Database & Persistence</h3>
                <p className="text-xs text-zinc-400">PostgreSQL Schema & Local Storage Fallback</p>
              </div>
            </div>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-md border flex items-center space-x-1 ${
                supabaseStatus?.configured
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-400 border-white/10'
              }`}
            >
              <span>{supabaseStatus?.configured ? 'Supabase Connected' : 'Local-First Mode'}</span>
            </span>
          </div>

          <div className="text-xs bg-zinc-950/60 p-3 rounded-xl border border-white/5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 text-[11px]">Storage Mode:</span>
              <span className="text-zinc-300 font-semibold">
                {supabaseStatus?.configured ? 'Cloud PostgreSQL + Local' : 'Local Storage (Active & Resilient)'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 text-[11px]">SQL Migrations:</span>
              <span className="text-emerald-400 font-mono text-[11px]">20261020000000_create_clipping_studio_schema.sql</span>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500">
            {supabaseStatus?.configured
              ? 'Structured metadata synchronizes with Supabase PostgreSQL without storing heavy media files in DB.'
              : 'Work seamlessly offline without Supabase credentials. Sync anytime by adding NEXT_PUBLIC_SUPABASE_URL.'}
          </p>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white tracking-tight">Your Clipping Projects</h2>
          <span className="text-xs text-zinc-500">{projects.length} project(s)</span>
        </div>

        {projects.length === 0 ? (
          /* Empty State */
          <div className="text-center py-16 px-4 rounded-2xl bg-zinc-900/30 border border-white/10 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
              <Film className="w-8 h-8" />
            </div>
            <div className="max-w-sm mx-auto">
              <h3 className="text-base font-bold text-white">No Clipping Projects Yet</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Create a project to import long video/audio files, mark precise clips, extract bulk timestamps, and build merge recipes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-white text-zinc-950 font-bold text-xs hover:bg-zinc-200 transition-colors cursor-pointer shadow-md"
            >
              <FolderPlus className="w-4 h-4 text-zinc-950" />
              <span>Create New Clipping Project</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => {
              const isSelected = activeProject?.id === project.id;
              const isEditing = editingProjectId === project.id;

              return (
                <div
                  key={project.id}
                  className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 ${
                    isSelected
                      ? 'bg-zinc-900 border-amber-500/40 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/20'
                      : 'bg-zinc-900/50 hover:bg-zinc-900 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      {isEditing ? (
                        <div className="flex items-center space-x-1.5 w-full">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-2 py-1 text-xs bg-zinc-950 border border-amber-500 rounded text-white focus:outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleRename(project.id)}
                            className="px-2 py-1 text-[11px] bg-white text-zinc-950 font-bold rounded"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <div className="flex-1">
                          <h3
                            onClick={() => selectProject(project.id)}
                            className="text-base font-bold text-white hover:text-amber-400 cursor-pointer transition-colors truncate"
                            title={project.name}
                          >
                            {project.name}
                          </h3>
                          {project.description && (
                            <p className="text-xs text-zinc-400 line-clamp-2 mt-0.5">
                              {project.description}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-4 text-[11px] text-zinc-400 pt-1">
                      <span className="flex items-center space-x-1">
                        <Film className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{project.mediaAssets?.length || 0} media</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <Scissors className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{project.clips?.length || 0} clips</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <Layers className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{project.mergeRecipes?.length || 0} recipes</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-white/5">
                    <div className="flex items-center space-x-1 text-[10px] text-zinc-500">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProjectId(project.id);
                          setEditName(project.name);
                        }}
                        title="Rename project"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateProject(project.id)}
                        title="Duplicate project"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete project "${project.name}"?`)) {
                            deleteProject(project.id);
                          }
                        }}
                        title="Delete project"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => selectProject(project.id)}
                        className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-zinc-800 hover:bg-white text-zinc-300 hover:text-zinc-950 font-semibold text-xs transition-colors ml-1"
                      >
                        <span>Open</span>
                        <Play className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white tracking-tight">Create Clipping Project</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase mb-1">Project Name</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. Osho Discourse Highlights — Vol 1"
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/15 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase mb-1">Description (Optional)</label>
                <textarea
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="Add editorial notes or topic summary..."
                  rows={2}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/15 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-white resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold shadow-md"
                >
                  Create & Open
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
