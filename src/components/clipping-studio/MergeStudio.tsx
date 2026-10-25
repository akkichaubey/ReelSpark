'use client';

import React, { useState, useMemo } from 'react';
import {
  Layers,
  Plus,
  Trash2,
  Copy,
  Edit2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Play,
  Film,
  Scissors,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  Settings2,
  Check,
  ChevronDown,
  Download,
  Share2,
} from 'lucide-react';
import { useClippingStore } from '@/lib/clipping-studio/use-clipping-store';
import {
  MergeRecipe,
  MergeRecipeItem,
  Clip,
  formatMsToTimestamp,
} from '@/lib/clipping-studio/contracts';
import { planMergeRecipe } from '@/lib/clipping-studio/merge-planner';

export const MergeStudio: React.FC = () => {
  const {
    activeProject,
    selectedRecipeId,
    selectRecipe,
    createRecipe,
    updateRecipe,
    deleteRecipe,
    duplicateRecipe,
    addClipToRecipe,
    removeClipFromRecipe,
    moveRecipeItem,
    reverseRecipeItems,
    selectClip,
    setInPoint,
    setOutPoint,
    setCurrentTimeMs,
    setActiveTab,
    auditionClip,
  } = useClippingStore();

  const [newRecipeName, setNewRecipeName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');

  const recipes = activeProject?.mergeRecipes || [];
  const clips = activeProject?.clips || [];
  const assets = activeProject?.mediaAssets || [];

  // Active recipe (default to first if none selected)
  const activeRecipe = useMemo(() => {
    if (selectedRecipeId) {
      const found = recipes.find((r) => r.id === selectedRecipeId);
      if (found) return found;
    }
    return recipes[0] || null;
  }, [recipes, selectedRecipeId]);

  // Compute merge plan & compatibility
  const mergePlan = useMemo(() => {
    if (!activeRecipe) return null;
    return planMergeRecipe(activeRecipe, clips, assets);
  }, [activeRecipe, clips, assets]);

  // Approximate file size estimate (based on ~12Mbps average bitrate)
  const estimatedFileSizeMb = useMemo(() => {
    if (!mergePlan) return 0;
    const seconds = mergePlan.totalDurationMs / 1000;
    return Math.max(1, Math.round((seconds * 1.5) / 8 * 10) / 10);
  }, [mergePlan]);

  const handleCreateRecipe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRecipeName.trim()) return;
    createRecipe(newRecipeName.trim());
    setNewRecipeName('');
    setShowCreateModal(false);
  };

  const handleRename = () => {
    if (activeRecipe && titleInput.trim()) {
      updateRecipe(activeRecipe.id, { name: titleInput.trim() });
    }
    setEditingTitle(false);
  };

  const handleAddAllClips = () => {
    if (!activeRecipe) return;
    clips.forEach((clip) => {
      addClipToRecipe(activeRecipe.id, clip.id);
    });
  };

  const handleAuditionClip = (clip: Clip) => {
    auditionClip(clip);
    setActiveTab('timeline');
  };

  const handleProceedToExport = () => {
    setActiveTab('export');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Layers className="w-5 h-5 text-amber-400" />
            <span>Merge Studio (Multi-Recipe Sequence Builder)</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
            Create unlimited independent sequence recipes from your clips (e.g. Recipe A: 2+8, Recipe B: 2+7, Recipe C: 3+8, Recipe D: 8+2). Non-destructive with lossless FFmpeg stream copy or filter complex encoding.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs shadow-md transition-all cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4 text-zinc-900" />
          <span>New Merge Recipe</span>
        </button>
      </div>

      {recipes.length === 0 ? (
        /* Empty State */
        <div className="text-center py-16 px-4 rounded-2xl bg-zinc-900/30 border border-white/10 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
            <Layers className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-bold text-white">No Merge Recipes Yet</h3>
            <p className="text-xs text-zinc-400">
              Create your first recipe to combine clips in any custom order, preview the sequence, and prepare for multi-clip exporting.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="px-5 py-2 rounded-xl bg-white text-zinc-950 font-bold text-xs hover:bg-zinc-200 transition-colors cursor-pointer"
          >
            Create First Recipe
          </button>
        </div>
      ) : (
        /* Two-Column Master / Detail Layout */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Recipes Selector (4 Cols) */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold px-1">
              <span>RECIPES ({recipes.length})</span>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="text-amber-400 hover:text-amber-300 flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>

            <div className="space-y-2">
              {recipes.map((recipe) => {
                const isSelected = activeRecipe?.id === recipe.id;
                const recipePlan = planMergeRecipe(recipe, clips, assets);

                return (
                  <div
                    key={recipe.id}
                    onClick={() => selectRecipe(recipe.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                      isSelected
                        ? 'bg-zinc-900 border-amber-500/60 shadow-md ring-1 ring-amber-500/30'
                        : 'bg-zinc-900/40 hover:bg-zinc-900/70 border-white/10'
                    }`}
                  >
                    <div className="overflow-hidden space-y-1 flex-1 pr-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-white truncate group-hover:text-amber-400 transition-colors">
                          {recipe.name}
                        </span>
                        {isSelected && (
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                        )}
                      </div>

                      <div className="flex items-center space-x-2 text-[11px] text-zinc-400">
                        <span className="flex items-center space-x-1">
                          <Scissors className="w-3 h-3 text-zinc-500" />
                          <span>{recipe.items.length} clip(s)</span>
                        </span>
                        <span className="text-zinc-600">•</span>
                        <span className="font-mono text-zinc-300 font-semibold">
                          {recipePlan.totalDurationFormatted}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateRecipe(recipe.id);
                        }}
                        title="Duplicate Recipe"
                        className="p-1 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete recipe "${recipe.name}"?`)) {
                            deleteRecipe(recipe.id);
                          }
                        }}
                        title="Delete Recipe"
                        className="p-1 rounded text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Recipe Editor & Sequence Builder (8 Cols) */}
          {activeRecipe && (
            <div className="lg:col-span-8 space-y-5">
              {/* Recipe Settings Header Card */}
              <div className="p-5 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  {/* Inline Name Editing */}
                  <div className="flex items-center space-x-2 w-full sm:w-auto">
                    {editingTitle ? (
                      <div className="flex items-center space-x-1.5 w-full">
                        <input
                          type="text"
                          value={titleInput}
                          onChange={(e) => setTitleInput(e.target.value)}
                          className="px-2 py-1 text-sm bg-zinc-950 border border-amber-400 rounded text-white focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={handleRename}
                          className="px-2.5 py-1 text-xs bg-white text-zinc-950 font-bold rounded cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <h3 className="text-lg font-black text-white tracking-tight">{activeRecipe.name}</h3>
                        <button
                          type="button"
                          onClick={() => {
                            setTitleInput(activeRecipe.name);
                            setEditingTitle(true);
                          }}
                          className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Summary Badges & Actions */}
                  <div className="flex items-center space-x-2 text-xs flex-wrap gap-y-2">
                    <span className="font-mono font-bold px-3 py-1 rounded-lg bg-zinc-800 text-amber-300 border border-white/10">
                      Total: {mergePlan?.totalDurationFormatted}
                    </span>

                    <span className="font-mono text-zinc-400 px-2 py-1 rounded-lg bg-zinc-800/80 border border-white/5 text-[11px]">
                      ~{estimatedFileSizeMb} MB
                    </span>

                    <button
                      type="button"
                      onClick={() => reverseRecipeItems(activeRecipe.id)}
                      disabled={activeRecipe.items.length < 2}
                      title="Reverse the order of all clips in this recipe"
                      className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 font-semibold border border-white/10 transition-colors cursor-pointer"
                    >
                      <ArrowUpDown className="w-3.5 h-3.5" />
                      <span>Reverse</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleProceedToExport}
                      className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs shadow transition-colors cursor-pointer"
                      title="Export this merged recipe in Export Studio"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export</span>
                    </button>
                  </div>
                </div>

                {/* Stream Compatibility & Concat Plan Diagnostic */}
                {mergePlan && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs flex items-start space-x-3 ${
                      mergePlan.requiresReencoding
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    }`}
                  >
                    {mergePlan.requiresReencoding ? (
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold">
                          Concat Strategy: {mergePlan.requiresReencoding ? 'Filter Complex (Re-encode)' : 'Lossless Stream Copy (Demuxer)'}
                        </span>
                      </div>
                      <p className="text-[11px] opacity-90 leading-relaxed">
                        {mergePlan.requiresReencoding
                          ? `Streams differ across clips (${mergePlan.reencodeReasons.join('; ')}). FFmpeg will automatically resample and re-encode seamlessly during export.`
                          : 'All clips share identical resolution, codecs, and audio formats. FFmpeg will concatenate losslessly at maximum speed without re-encoding!'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Recipe Output Settings */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Output Format</label>
                    <select
                      value={activeRecipe.outputFormat}
                      onChange={(e) => updateRecipe(activeRecipe.id, { outputFormat: e.target.value as any })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-white/10 text-white focus:outline-none"
                    >
                      <option value="mp4">MP4 (Video + Audio)</option>
                      <option value="mov">MOV (QuickTime)</option>
                      <option value="webm">WEBM (HTML5 Video)</option>
                      <option value="mp3">MP3 (Audio Only)</option>
                      <option value="wav">WAV (Lossless Audio)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Target Resolution</label>
                    <select
                      value={activeRecipe.targetResolution}
                      onChange={(e) => updateRecipe(activeRecipe.id, { targetResolution: e.target.value as any })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-white/10 text-white focus:outline-none"
                    >
                      <option value="source">Match Source Video</option>
                      <option value="1080p">1080p Full HD</option>
                      <option value="720p">720p HD</option>
                      <option value="4k">4K UHD</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Audio Master</label>
                    <label className="flex items-center space-x-2 pt-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeRecipe.normalizeAudio}
                        onChange={(e) => updateRecipe(activeRecipe.id, { normalizeAudio: e.target.checked })}
                        className="w-4 h-4 rounded bg-zinc-800 border-white/20 text-zinc-900"
                      />
                      <span className="text-zinc-300 text-xs">Normalize Audio (loudnorm)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Assembled Sequence Track */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                    Assembled Sequence Track ({activeRecipe.items.length} Clips)
                  </h4>
                  <span className="text-[11px] text-zinc-500">
                    Use ↑ and ↓ arrows to reorder clips in this recipe
                  </span>
                </div>

                {activeRecipe.items.length === 0 ? (
                  <div className="p-8 rounded-xl bg-zinc-900/30 border border-dashed border-white/10 text-center space-y-2">
                    <Scissors className="w-6 h-6 text-zinc-600 mx-auto" />
                    <p className="text-xs text-zinc-400">No clips added to this recipe yet.</p>
                    <p className="text-[11px] text-zinc-500">
                      Click the "+" button on any clip in the pool below to add it to the sequence.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeRecipe.items
                      .slice()
                      .sort((a, b) => a.orderIndex - b.orderIndex)
                      .map((item, idx, arr) => {
                        const clip = clips.find((c) => c.id === item.clipId);
                        const mediaAsset = assets.find((a) => a.id === clip?.mediaAssetId);

                        return (
                          <React.Fragment key={item.id}>
                            <div className="p-3 rounded-xl bg-zinc-900 border border-white/10 hover:border-white/20 flex items-center justify-between transition-colors space-x-3">
                              {/* Sequence Number */}
                              <div className="w-7 h-7 rounded-lg bg-zinc-800 text-amber-400 font-bold text-xs flex items-center justify-center flex-shrink-0">
                                #{idx + 1}
                              </div>

                              {/* Clip Details */}
                              <div className="flex-1 overflow-hidden">
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs font-bold text-white truncate">
                                    {clip?.name || 'Missing Clip'}
                                  </span>
                                  {clip && (
                                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300">
                                      {formatMsToTimestamp(clip.durationMs, false)}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-zinc-400 truncate">
                                  Source: {mediaAsset?.filename || 'Unknown'} • [{clip ? formatMsToTimestamp(clip.startMs, false) : ''} → {clip ? formatMsToTimestamp(clip.endMs, false) : ''}]
                                </p>
                              </div>

                              {/* Reordering & Action Controls */}
                              <div className="flex items-center space-x-1">
                                {clip && (
                                  <button
                                    type="button"
                                    onClick={() => handleAuditionClip(clip)}
                                    title="Audition clip bounds in player"
                                    className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer mr-1"
                                  >
                                    <Play className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* Move Up */}
                                <button
                                  type="button"
                                  onClick={() => moveRecipeItem(activeRecipe.id, idx, 'up')}
                                  disabled={idx === 0}
                                  title="Move Up"
                                  className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-300 transition-colors cursor-pointer"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>

                                {/* Move Down */}
                                <button
                                  type="button"
                                  onClick={() => moveRecipeItem(activeRecipe.id, idx, 'down')}
                                  disabled={idx === arr.length - 1}
                                  title="Move Down"
                                  className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-300 transition-colors cursor-pointer"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>

                                {/* Remove from recipe */}
                                <button
                                  type="button"
                                  onClick={() => removeClipFromRecipe(activeRecipe.id, item.id)}
                                  title="Remove clip from recipe (Original clip remains in library)"
                                  className="p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors ml-1 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Visual Timeline Connector between sequence blocks */}
                            {idx < arr.length - 1 && (
                              <div className="flex items-center justify-center py-0.5">
                                <div className="flex items-center space-x-2 text-[10px] text-zinc-500 font-mono">
                                  <div className="w-8 h-px bg-white/10" />
                                  <span className="px-2 py-0.5 rounded-full bg-zinc-950 border border-white/10 text-zinc-400 text-[9px]">
                                    {mergePlan?.requiresReencoding ? 'Re-encode Crossfade' : 'Lossless Direct Cut'}
                                  </span>
                                  <div className="w-8 h-px bg-white/10" />
                                </div>
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Clip Pool: Add from Project Clips */}
              <div className="space-y-3 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center space-x-1.5">
                      <Scissors className="w-4 h-4 text-amber-400" />
                      <span>Available Project Clips ({clips.length})</span>
                    </h4>
                    {clips.length > 0 && (
                      <button
                        type="button"
                        onClick={handleAddAllClips}
                        className="text-[11px] text-amber-400 hover:text-amber-300 hover:underline cursor-pointer"
                      >
                        + Add All Clips
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('timeline')}
                    className="text-xs text-zinc-400 hover:text-zinc-200 hover:underline cursor-pointer"
                  >
                    + Create More Clips in Timeline
                  </button>
                </div>

                {clips.length === 0 ? (
                  <div className="p-4 rounded-xl bg-zinc-900/30 text-center text-xs text-zinc-400">
                    No clips in library. Go to the Timeline tab to mark clips.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                    {clips.map((clip) => {
                      // Check how many times this clip appears in this recipe
                      const usageCount = activeRecipe.items.filter((i) => i.clipId === clip.id).length;

                      return (
                        <div
                          key={clip.id}
                          className="p-2.5 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-between space-x-2 hover:border-white/20 transition-colors"
                        >
                          <div className="overflow-hidden">
                            <h5 className="text-xs font-bold text-white truncate" title={clip.name}>
                              {clip.name}
                            </h5>
                            <span className="text-[10px] font-mono text-zinc-400">
                              {formatMsToTimestamp(clip.durationMs, false)}
                            </span>
                            {usageCount > 0 && (
                              <span className="ml-1 text-[9px] text-amber-400 font-bold">
                                (in recipe: {usageCount}x)
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => addClipToRecipe(activeRecipe.id, clip.id)}
                            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs shadow-sm transition-colors cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Recipe Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white tracking-tight">Create Merge Recipe</h3>
            <form onSubmit={handleCreateRecipe} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase mb-1">Recipe Name</label>
                <input
                  type="text"
                  value={newRecipeName}
                  onChange={(e) => setNewRecipeName(e.target.value)}
                  placeholder="e.g. Recipe A: Hook + Key Takeaways"
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/15 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold shadow-md cursor-pointer"
                >
                  Create Recipe
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
