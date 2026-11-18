'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import Link from 'next/link';
import {
  FolderOpen,
  Film,
  ImageIcon,
  Music,
  Upload,
  Trash2,
  Search,
  Clapperboard,
  Play,
  X,
  Loader2,
  Star,
  Pencil,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { SiteLoader } from '@/components/SiteLoader';
import { useAuthStore } from '@/lib/use-auth-store';
import { AuthModal } from '@/components/AuthModal';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { uploadFileWithProgress, UploadCancelledError } from '@/lib/upload-with-progress';
import type { TimelineAsset } from '@/lib/timeline/model';

function MediaLibraryPageContent() {
  const { user, isLoading: authLoading, openAuthModal, checkAuth } = useAuthStore();
  const [assets, setAssets] = useState<TimelineAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'video' | 'image' | 'audio' | 'favorite'>('all');

  // Rename state
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isSavingRename, setIsSavingRename] = useState(false);

  // Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortController = useRef<AbortController | null>(null);

  // Preview & Delete Modals
  const [previewAsset, setPreviewAsset] = useState<TimelineAsset | null>(null);
  const [assetToDelete, setAssetToDelete] = useState<TimelineAsset | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchLibrary = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/caption-maker/media', { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401) {
          setAssets([]);
          return;
        }
        throw new Error('Failed to load media library');
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.assets)) {
        setAssets(data.assets);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading media library');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    let cancelled = false;
    if (user) {
      const timer = setTimeout(() => {
        if (!cancelled) {
          void fetchLibrary();
        }
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    } else if (!authLoading) {
      const timer = setTimeout(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
  }, [user, authLoading, fetchLibrary]);

  const handleUpload = async (file: File) => {
    if (uploadAbortController.current) return;
    const controller = new AbortController();
    uploadAbortController.current = controller;
    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|avif|bmp)$/i.test(file.name);
      const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name);
      const mediaType = isImage ? 'image' : isVideo ? 'video' : 'audio';

      const result = await uploadFileWithProgress<{ success?: boolean; error?: string }>(
        '/api/caption-maker/upload',
        file,
        setUploadProgress,
        mediaType,
        controller.signal
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to upload media file');
      }

      await fetchLibrary();
    } catch (err) {
      if (!(err instanceof UploadCancelledError)) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed. Please retry.');
      }
    } finally {
      if (uploadAbortController.current === controller) {
        uploadAbortController.current = null;
      }
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const requestDelete = (asset: TimelineAsset) => {
    setDeleteError(null);
    setAssetToDelete(asset);
  };

  const confirmDelete = async () => {
    if (!assetToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch('/api/caption-maker/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: assetToDelete.fileUrl }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete asset');
      }
      const deletedUrls = new Set(data.deletedUrls || [assetToDelete.fileUrl]);
      setAssets(prev => prev.filter(a => a.id !== assetToDelete.id && !deletedUrls.has(a.fileUrl) && a.fileName !== assetToDelete.fileName));
      if (previewAsset?.id === assetToDelete.id) {
        setPreviewAsset(null);
      }
      setAssetToDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete media');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleFavorite = async (asset: TimelineAsset) => {
    const nextFavorite = !asset.isFavorite;
    // Optimistic update
    setAssets(prev => prev.map(a => a.id === asset.id || a.fileUrl === asset.fileUrl ? { ...a, isFavorite: nextFavorite } : a));
    if (previewAsset && (previewAsset.id === asset.id || previewAsset.fileUrl === asset.fileUrl)) {
      setPreviewAsset(prev => prev ? { ...prev, isFavorite: nextFavorite } : null);
    }
    try {
      const res = await fetch('/api/caption-maker/media', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: asset.fileUrl, isFavorite: nextFavorite }),
      });
      if (!res.ok) {
        throw new Error('Failed to update favorite status');
      }
    } catch {
      // Revert optimistic update
      setAssets(prev => prev.map(a => a.id === asset.id || a.fileUrl === asset.fileUrl ? { ...a, isFavorite: !nextFavorite } : a));
      if (previewAsset && (previewAsset.id === asset.id || previewAsset.fileUrl === asset.fileUrl)) {
        setPreviewAsset(prev => prev ? { ...prev, isFavorite: !nextFavorite } : null);
      }
      setError('Could not update favorite status');
    }
  };

  const handleStartRename = (asset: TimelineAsset) => {
    setEditingAssetId(asset.id);
    setEditingName(asset.fileName);
  };

  const handleSaveRename = async (asset: TimelineAsset) => {
    const cleanName = editingName.trim();
    if (!cleanName || cleanName === asset.fileName) {
      setEditingAssetId(null);
      return;
    }
    setIsSavingRename(true);
    // Optimistic update
    setAssets(prev => prev.map(a => a.id === asset.id || a.fileUrl === asset.fileUrl ? { ...a, fileName: cleanName } : a));
    if (previewAsset && (previewAsset.id === asset.id || previewAsset.fileUrl === asset.fileUrl)) {
      setPreviewAsset(prev => prev ? { ...prev, fileName: cleanName } : null);
    }
    setEditingAssetId(null);
    try {
      const res = await fetch('/api/caption-maker/media', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: asset.fileUrl, fileName: cleanName }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to rename media');
      }
      if (data.asset?.fileName) {
        setAssets(prev => prev.map(a => a.id === asset.id || a.fileUrl === asset.fileUrl ? { ...a, fileName: data.asset.fileName } : a));
      }
    } catch (err) {
      setAssets(prev => prev.map(a => a.id === asset.id || a.fileUrl === asset.fileUrl ? { ...a, fileName: asset.fileName } : a));
      setError(err instanceof Error ? err.message : 'Rename failed');
    } finally {
      setIsSavingRename(false);
    }
  };

  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      const matchesSearch = asset.fileName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType =
        selectedType === 'all'
          ? true
          : selectedType === 'favorite'
          ? Boolean(asset.isFavorite)
          : asset.mediaType === selectedType;
      return matchesSearch && matchesType;
    });
  }, [assets, searchQuery, selectedType]);

  const counts = useMemo(() => ({
    all: assets.length,
    favorite: assets.filter(a => Boolean(a.isFavorite)).length,
    video: assets.filter(a => a.mediaType === 'video').length,
    image: assets.filter(a => a.mediaType === 'image').length,
    audio: assets.filter(a => a.mediaType === 'audio').length,
  }), [assets]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <SiteLoader label="Authenticating…" />
      </div>
    );
  }

  if (!user) {
    return (
      <DashboardLayout
        title="Media Library"
        subtitle="Manage your persistent user media library"
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Media Library' }]}
      >
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
          <div className="w-16 h-16 rounded-3xl bg-amber-400/10 border border-amber-400/30 text-amber-400 flex items-center justify-center mb-4 shadow-xl">
            <FolderOpen className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Sign in to access your Media Library</h2>
          <p className="text-xs text-zinc-400 max-w-sm mb-6">
            Uploaded images, videos, and audio are saved to your account and persist across all reels and projects.
          </p>
          <Button variant="authGate" onClick={() => openAuthModal('login')} className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs rounded-xl shadow-md">
            Sign In / Register
          </Button>
          <AuthModal />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Media Library"
      subtitle="Your persistent library of images, videos, and audio files across all reels and studios"
      breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Media Library' }]}
    >
      <div className="max-w-[1600px] mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* Top Control Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 backdrop-blur-sm">
          
          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setSelectedType('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${selectedType === 'all' ? 'bg-amber-400 text-black font-bold shadow-sm' : 'bg-zinc-800/80 text-zinc-400 hover:text-white'}`}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setSelectedType('favorite')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${selectedType === 'favorite' ? 'bg-amber-400 text-black font-bold shadow-sm' : 'bg-zinc-800/80 text-zinc-400 hover:text-white'}`}
            >
              <Star size={12} className={selectedType === 'favorite' ? 'fill-black' : 'fill-amber-400 text-amber-400'} />
              <span>Favorites ({counts.favorite})</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedType('video')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${selectedType === 'video' ? 'bg-amber-400 text-black font-bold shadow-sm' : 'bg-zinc-800/80 text-zinc-400 hover:text-white'}`}
            >
              Videos ({counts.video})
            </button>
            <button
              type="button"
              onClick={() => setSelectedType('image')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${selectedType === 'image' ? 'bg-amber-400 text-black font-bold shadow-sm' : 'bg-zinc-800/80 text-zinc-400 hover:text-white'}`}
            >
              Images ({counts.image})
            </button>
            <button
              type="button"
              onClick={() => setSelectedType('audio')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${selectedType === 'audio' ? 'bg-amber-400 text-black font-bold shadow-sm' : 'bg-zinc-800/80 text-zinc-400 hover:text-white'}`}
            >
              Audio ({counts.audio})
            </button>
          </div>

          {/* Search & Upload Action */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="relative w-48 sm:w-60 shrink-0">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <Input
                type="text"
                placeholder="Search library..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 h-9 text-xs bg-zinc-950/80 border-zinc-700/80 rounded-xl text-zinc-200 placeholder:text-zinc-500 focus:border-amber-400"
              />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept="video/*,image/*,audio/*"
              onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void handleUpload(file);
              }}
            />

            <Button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="h-9 px-4 bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs rounded-xl shadow-md flex items-center gap-2 shrink-0 cursor-pointer"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                  <span>{uploadProgress !== null ? `${uploadProgress}%` : 'Uploading…'}</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Upload Media</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {uploadError && (
          <div className="p-3 rounded-xl bg-red-950/50 border border-red-800/50 text-red-200 text-xs flex items-center justify-between">
            <span>{uploadError}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setUploadError(null)} className="text-red-400 hover:text-white">✕</Button>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/50 text-amber-200 text-xs flex items-center justify-between">
            <span>{error}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setError(null)} className="text-amber-400 hover:text-white">✕</Button>
          </div>
        )}

        {/* Media Grid */}
        {isLoading ? (
          <div className="py-24 text-center">
            <SiteLoader label="Loading library assets…" />
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/20 text-center p-8 space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900 flex items-center justify-center text-zinc-600 mb-2 border border-zinc-800">
              <FolderOpen size={32} />
            </div>
            <h3 className="text-base font-semibold text-white">
              {searchQuery ? 'No matching media files' : 'Your media library is empty'}
            </h3>
            <p className="text-xs text-zinc-400 max-w-md">
              Upload videos, images, or audio files here. They are permanently saved to your account and can be used in any reel or smart clip!
            </p>
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 px-5 py-2 bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer"
            >
              <Upload size={14} />
              <span>Upload First Media</span>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredAssets.map((asset, index) => {
              const Icon = asset.mediaType === 'audio' ? Music : asset.mediaType === 'video' ? Film : ImageIcon;
              const isThisDeleting = isDeleting && assetToDelete?.id === asset.id;

              return (
                <div
                  key={`${asset.id}_${asset.fileUrl || ''}_${index}`}
                  className="group relative rounded-2xl border border-zinc-800 bg-zinc-900/70 hover:border-amber-400/60 transition-all flex flex-col overflow-hidden shadow-sm hover:shadow-lg hover:shadow-black/50"
                >
                  {/* Media Visual Preview */}
                  <div
                    onClick={() => setPreviewAsset(asset)}
                    className="relative h-44 bg-black/60 flex items-center justify-center overflow-hidden cursor-pointer"
                  >
                    {asset.mediaType === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={asset.fileUrl} alt={asset.fileName} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                    ) : asset.mediaType === 'video' ? (
                      <>
                        <video src={asset.fileUrl} className="h-full w-full object-cover pointer-events-none group-hover:scale-105 transition-transform duration-300" muted preload="metadata" />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-10 h-10 rounded-full bg-amber-400/90 text-black flex items-center justify-center shadow-lg">
                            <Play size={16} className="fill-black ml-0.5" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-zinc-500">
                        <Icon size={36} />
                        <span className="text-[10px] text-zinc-400 font-medium">Audio Track</span>
                      </div>
                    )}

                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-black/80 text-amber-300 border border-amber-400/30">
                      {asset.mediaType}
                    </span>

                    {/* Favorite Star Button */}
                    <button
                      type="button"
                      aria-label={asset.isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
                      title={asset.isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleToggleFavorite(asset);
                      }}
                      className={`absolute top-2 right-2 z-10 p-1.5 rounded-lg backdrop-blur-md transition-all cursor-pointer ${
                        asset.isFavorite
                          ? 'bg-amber-400/20 text-amber-400 border border-amber-400/60 shadow-lg'
                          : 'bg-black/60 text-zinc-400 hover:text-amber-300 border border-white/10 opacity-70 group-hover:opacity-100 hover:scale-110'
                      }`}
                    >
                      <Star size={13} className={asset.isFavorite ? 'fill-amber-400 text-amber-400' : ''} />
                    </button>

                    {asset.durationMs > 0 && (
                      <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/80 text-zinc-300">
                        {(asset.durationMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>

                  {/* Card Info & Quick Actions */}
                  <div className="p-3 space-y-2.5 flex-1 flex flex-col justify-between">
                    <div>
                      {editingAssetId === asset.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void handleSaveRename(asset);
                          }}
                          className="flex items-center gap-1 w-full"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="h-7 text-xs px-2 py-0 bg-zinc-950 border-amber-400 rounded-lg text-white focus:ring-1 focus:ring-amber-400 w-full"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.stopPropagation();
                                setEditingAssetId(null);
                              }
                            }}
                          />
                          <Button
                            type="submit"
                            size="sm"
                            disabled={isSavingRename}
                            className="h-7 px-2 bg-amber-400 text-black hover:bg-amber-300 text-xs font-bold shrink-0 cursor-pointer"
                            title="Save name"
                          >
                            <Check size={12} />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingAssetId(null)}
                            className="h-7 px-1.5 text-zinc-400 hover:text-white shrink-0 cursor-pointer"
                            title="Cancel"
                          >
                            <X size={12} />
                          </Button>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between gap-1 group/name">
                          <p
                            className="text-xs font-semibold text-zinc-100 truncate cursor-pointer hover:text-amber-300 transition-colors flex-1"
                            title={`Click to rename: ${asset.fileName}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartRename(asset);
                            }}
                          >
                            {asset.fileName}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartRename(asset);
                            }}
                            className="h-5 w-5 p-0 text-zinc-500 hover:text-amber-300 opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0"
                            title="Rename file"
                          >
                            <Pencil size={11} />
                          </Button>
                        </div>
                      )}
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {asset.width && asset.height ? `${asset.width}×${asset.height}` : asset.mediaType}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-1">
                      <Link
                        href={`/reel-maker`}
                        className="flex-1 text-center py-1.5 px-2 rounded-lg bg-zinc-800 hover:bg-amber-400 hover:text-black text-[11px] font-medium text-zinc-200 transition-colors flex items-center justify-center gap-1"
                        title="Use in Reel Maker"
                      >
                        <Clapperboard size={12} />
                        <span>Reel Maker</span>
                      </Link>

                      <Button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => requestDelete(asset)}
                        title="Delete permanently from library"
                        className="p-1.5 rounded-lg border border-zinc-800 hover:border-red-500/60 hover:bg-red-500/10 text-zinc-400 hover:text-red-300 transition-colors cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Asset Full Preview Modal */}
      {previewAsset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setPreviewAsset(null)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6 space-y-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleToggleFavorite(previewAsset)}
                  className={`p-2 rounded-xl border transition-all cursor-pointer ${
                    previewAsset.isFavorite
                      ? 'bg-amber-400/20 text-amber-400 border-amber-400/60 shadow-md'
                      : 'bg-zinc-900 text-zinc-400 hover:text-amber-300 border-zinc-800'
                  }`}
                  title={previewAsset.isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
                >
                  <Star size={16} className={previewAsset.isFavorite ? 'fill-amber-400 text-amber-400' : ''} />
                </button>
                <div>
                  <h3 className="text-base font-bold text-white truncate max-w-md">{previewAsset.fileName}</h3>
                  <p className="text-xs text-zinc-400">{previewAsset.mediaType.toUpperCase()} · {(previewAsset.durationMs / 1000).toFixed(1)}s</p>
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPreviewAsset(null)} className="text-zinc-400 hover:text-white">
                <X size={18} />
              </Button>
            </div>

            <div className="max-h-[60vh] flex items-center justify-center bg-black/60 rounded-xl overflow-hidden p-2">
              {previewAsset.mediaType === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewAsset.fileUrl} alt={previewAsset.fileName} className="max-h-[55vh] max-w-full object-contain" />
              ) : previewAsset.mediaType === 'video' ? (
                <video src={previewAsset.fileUrl} controls autoPlay className="max-h-[55vh] max-w-full rounded-lg" />
              ) : (
                <audio src={previewAsset.fileUrl} controls autoPlay className="w-full my-8" />
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Link
                href="/reel-maker"
                className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs flex items-center gap-1.5 shadow"
              >
                <Clapperboard size={14} />
                <span>Open in Reel Maker</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(assetToDelete)}
        onClose={() => {
          if (!isDeleting) {
            setAssetToDelete(null);
            setDeleteError(null);
          }
        }}
        onConfirm={confirmDelete}
        itemName={assetToDelete?.fileName || 'Media file'}
        itemType={assetToDelete?.mediaType || 'media'}
        isDeleting={isDeleting}
        error={deleteError}
      />
    </DashboardLayout>
  );
}

export default function MediaLibraryPage() {
  return (
    <Suspense fallback={<SiteLoader label="Loading Media Library…" />}>
      <MediaLibraryPageContent />
    </Suspense>
  );
}
