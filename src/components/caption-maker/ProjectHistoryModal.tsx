'use strict';
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { CaptionProject } from '@/lib/caption-maker/types';
import {
  ProjectSnapshot,
  getProjectSnapshots,
  saveProjectSnapshot,
  deleteProjectSnapshot,
  clearAllSnapshots,
  duplicateProject,
  exportProjectAsJson,
  importProjectFromJson,
} from '@/lib/caption-maker/project-storage';
import {
  X,
  History,
  Clock,
  RotateCcw,
  Copy,
  Download,
  Upload,
  Trash2,
  Camera,
  CheckCircle2,
  FileCode,
  AlertCircle,
} from 'lucide-react';

interface ProjectHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: CaptionProject;
  onRestoreProject: (restored: CaptionProject) => void;
  onDuplicateProject: (duplicated: CaptionProject) => void;
}

export const ProjectHistoryModal: React.FC<ProjectHistoryModalProps> = ({
  isOpen,
  onClose,
  currentProject,
  onRestoreProject,
  onDuplicateProject,
}) => {
  const [snapshots, setSnapshots] = useState<ProjectSnapshot[]>([]);
  const [customLabel, setCustomLabel] = useState<string>('');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSnapshots(getProjectSnapshots());
      setStatusNotice(null);
      setErrorNotice(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const showNotice = (msg: string) => {
    setStatusNotice(msg);
    setTimeout(() => setStatusNotice(null), 3000);
  };

  const showError = (msg: string) => {
    setErrorNotice(msg);
    setTimeout(() => setErrorNotice(null), 4000);
  };

  const handleCreateSnapshot = () => {
    const label = customLabel.trim() || 'Manual Checkpoint';
    const updated = saveProjectSnapshot(currentProject, label);
    setSnapshots(updated);
    setCustomLabel('');
    showNotice(`📸 Saved checkpoint: "${label}"`);
  };

  const handleRestore = (snapshot: ProjectSnapshot) => {
    onRestoreProject(snapshot.project);
    showNotice(`↺ Restored version from ${new Date(snapshot.timestamp).toLocaleTimeString()}`);
    setTimeout(() => onClose(), 600);
  };

  const handleDelete = (id: string) => {
    const updated = deleteProjectSnapshot(id);
    setSnapshots(updated);
    showNotice('Deleted snapshot');
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear all version history snapshots?')) {
      clearAllSnapshots();
      setSnapshots([]);
      showNotice('Cleared all snapshots');
    }
  };

  const handleDuplicate = () => {
    const copy = duplicateProject(currentProject);
    onDuplicateProject(copy);
    showNotice(`📋 Created duplicate: "${copy.title}"`);
    setTimeout(() => onClose(), 600);
  };

  const handleExportJson = () => {
    const jsonStr = exportProjectAsJson(currentProject);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(currentProject.title || 'reel_project').replace(/[^a-zA-Z0-9_-]/g, '_')}.reelproj`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotice('⬇️ Exported .reelproj backup file');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;
      const res = importProjectFromJson(content);
      if (res.success && res.project) {
        onRestoreProject(res.project);
        saveProjectSnapshot(res.project, 'Imported Backup');
        showNotice(`⬆️ Imported project: "${res.project.title}"`);
        setTimeout(() => onClose(), 600);
      } else {
        showError(res.error || 'Failed to import project file');
      }
    };
    reader.onerror = () => {
      showError('Failed to read file from disk');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-zinc-950/80 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <History className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-100 text-sm">
                Project Version History & Snapshots
              </h3>
              <p className="text-[11px] text-zinc-400">
                {currentProject.title || 'Untitled Reel'} • {currentProject.transcript?.length || 0} words
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

        {/* Notices */}
        {statusNotice && (
          <div className="mx-6 mt-3 p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{statusNotice}</span>
          </div>
        )}
        {errorNotice && (
          <div className="mx-6 mt-3 p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorNotice}</span>
          </div>
        )}

        {/* Action Controls Bar */}
        <div className="p-4 bg-zinc-950/40 border-b border-zinc-800 space-y-3">
          {/* New Snapshot input */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Checkpoint label (e.g. Before Style Change)..."
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateSnapshot()}
              className="flex-1 bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded-xl px-3 py-2 focus:border-amber-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCreateSnapshot}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer shrink-0"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Save Checkpoint</span>
            </button>
          </div>

          {/* Productivity Tools (Duplicate, Backup Export/Import) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-800/80 text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDuplicate}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Create an alternate duplicate of this project"
              >
                <Copy className="w-3.5 h-3.5 text-amber-400" />
                <span>Duplicate Project</span>
              </button>

              <button
                type="button"
                onClick={handleExportJson}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Download full project backup as .reelproj JSON"
              >
                <Download className="w-3.5 h-3.5 text-zinc-400" />
                <span>Export Backup (.reelproj)</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Restore from a downloaded .reelproj file"
              >
                <Upload className="w-3.5 h-3.5 text-zinc-400" />
                <span>Import Backup</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".reelproj,.json"
                onChange={handleImportFile}
                className="hidden"
              />
            </div>

            {snapshots.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-[11px] text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
              >
                Clear All History
              </button>
            )}
          </div>
        </div>

        {/* Snapshots List Area */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1 custom-scrollbar text-xs">
          <div className="flex items-center justify-between text-zinc-400 font-medium px-1">
            <span>Version History Timeline ({snapshots.length}/10)</span>
            <span className="text-[11px] text-zinc-500">Auto-saves every edit</span>
          </div>

          {snapshots.length === 0 ? (
            <div className="p-8 text-center bg-zinc-950/40 border border-zinc-800/80 rounded-xl space-y-2">
              <Clock className="w-8 h-8 text-zinc-500 mx-auto" />
              <h4 className="font-semibold text-zinc-200">No Snapshots Yet</h4>
              <p className="text-zinc-400 text-[11px]">
                Create a checkpoint above or start editing to see automatic project version history.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {snapshots.map((snap) => {
                const dateObj = new Date(snap.timestamp);
                const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });

                return (
                  <div
                    key={snap.id}
                    className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 hover:border-zinc-700 flex items-center justify-between gap-3 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                        <FileCode className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-zinc-100 truncate flex items-center gap-2">
                          <span>{snap.label}</span>
                          <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-1.5 py-0.2 rounded border border-zinc-800">
                            {snap.aspectRatio}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                          {dateStr} at {timeStr} • {snap.wordCount} words • {snap.duration ? `${snap.duration.toFixed(1)}s` : 'No audio'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRestore(snap)}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-semibold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                        title="Restore project to this version"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                        <span>Restore</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(snap.id)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                        title="Delete snapshot"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
