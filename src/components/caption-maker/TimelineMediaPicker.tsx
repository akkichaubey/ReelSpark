"use client";

import { Button } from '@/components/ui/button';
import { useEffect, useRef, useState, useMemo } from "react";
import { Film, ImageIcon, Music, Upload, Trash2, X, FolderOpen, Star } from "lucide-react";
import { uploadFileWithProgress, UploadCancelledError } from "@/lib/upload-with-progress";
import type { AudioAsset, ImageAsset } from "@/lib/caption-maker/types";
import { compatibleAsset, type TimelineAsset, type TimelineTrack } from "@/lib/timeline/model";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";

export function TimelineMediaPicker({
  track,
  title,
  subtitle,
  imageOnly = false,
  assets,
  onAdd,
  onUpload,
  onDelete,
  onClose,
}: {
  track?: TimelineTrack;
  title?: string;
  subtitle?: string;
  imageOnly?: boolean;
  assets: TimelineAsset[];
  onAdd: (assetId: string) => void;
  onUpload: (asset: TimelineAsset) => void;
  onDelete?: (assetId: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [assetToDelete, setAssetToDelete] = useState<TimelineAsset | null>(null);
  const [deleteModalError, setDeleteModalError] = useState<string | null>(null);
  const [mediaFilter, setMediaFilter] = useState<'all' | 'video' | 'image' | 'audio' | 'favorite'>('all');
  const busy = progress !== null || deleting !== null;

  const confirmDelete = async () => {
    if (!assetToDelete || !onDelete) return;
    setDeleting(assetToDelete.id);
    setDeleteModalError(null);
    try {
      await onDelete(assetToDelete.id);
      setAssetToDelete(null);
      setError("");
    } catch (cause) {
      setDeleteModalError(cause instanceof Error ? cause.message : "Unable to remove media.");
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    return () => {
      controller.current?.abort();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  const upload = async (file: File) => {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setProgress(0);
    setError("");
    try {
      const isImageFile = file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg|avif|bmp|ico|tiff?|heic)$/i.test(file.name);
      const type = imageOnly
        ? "image"
        : isImageFile
          ? "image"
          : file.type.startsWith("video/") || /\.(mp4|mov|webm|mkv)$/i.test(file.name)
            ? "video"
            : "audio";
      const result = await uploadFileWithProgress<{
        success?: boolean; error?: string; asset?: ImageAsset | AudioAsset; type?: "image" | "video" | "audio";
      }>("/api/caption-maker/upload", file, setProgress, type, request.signal);
      if (request.signal.aborted) return;
      if (!result.success || !result.asset) throw new Error(result.error || "Upload failed. Please retry.");
      const source = result.asset;
      const visual = "fitMode" in source ? source : undefined;
      onUpload({
        id: source.id, fileName: source.fileName, fileUrl: source.fileUrl,
        mediaType: result.type || type,
        durationMs: Math.round((source.duration || (type === "image" ? 3 : 0)) * 1000),
        width: visual?.width, height: visual?.height, fitMode: visual?.fitMode,
        position: visual?.position, scale: visual?.scale,
        hasAudio: (result.type || type) !== "image",
      });
    } catch (cause) {
      if (!request.signal.aborted && !(cause instanceof UploadCancelledError))
        setError(cause instanceof Error ? cause.message : "Upload failed. Please retry.");
    } finally {
      if (controller.current === request) controller.current = null;
      if (!request.signal.aborted) setProgress(null);
    }
  };

  const filteredAssets = useMemo(() => {
    let list = imageOnly
      ? assets.filter(a => a.mediaType === "image" || /\.(jpe?g|png|webp|svg|gif|avif|bmp|ico|tiff?|heic)$/i.test(a.fileName || a.fileUrl))
      : assets;

    if (!imageOnly) {
      if (mediaFilter === 'favorite') {
        list = list.filter(a => Boolean(a.isFavorite));
      } else if (mediaFilter !== 'all') {
        list = list.filter(a => a.mediaType === mediaFilter);
      }
    }
    return list;
  }, [assets, imageOnly, mediaFilter]);

  const counts = useMemo(() => ({
    all: assets.length,
    favorite: assets.filter(a => Boolean(a.isFavorite)).length,
    video: assets.filter(a => a.mediaType === 'video').length,
    image: assets.filter(a => a.mediaType === 'image').length,
    audio: assets.filter(a => a.mediaType === 'audio').length,
  }), [assets]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose} onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); onClose(); }
      }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="timeline-media-title" tabIndex={-1}
        onClick={event => event.stopPropagation()}
        onKeyDown={event => {
          if (event.key !== "Tab") return;
          const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([hidden]), [tabindex="0"]'));
          const first = targets[0], last = targets[targets.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
            event.preventDefault(); first?.focus();
          }
        }}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-4 rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl outline-none">
        
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-400">
              <FolderOpen size={18} />
            </div>
            <div>
              <h2 id="timeline-media-title" className="text-base font-semibold text-amber-300">
                {title || "User Media Library"}
              </h2>
              <p className="text-xs text-zinc-400">
                {subtitle || (track ? `Choose media for ${track.name} or pick from your library` : "Uploaded media is saved to your account and reusable across any reel")}
              </p>
            </div>
          </div>
          <Button type="button" aria-label="Close media picker" onClick={onClose} className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"><X size={18}/></Button>
        </div>

        {/* Filter Pills */}
        {!imageOnly && (
          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setMediaFilter('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${mediaFilter === 'all' ? 'bg-amber-400 text-black font-semibold' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setMediaFilter('favorite')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${mediaFilter === 'favorite' ? 'bg-amber-400 text-black font-semibold' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
            >
              <Star size={11} className={mediaFilter === 'favorite' ? 'fill-black' : 'fill-amber-400 text-amber-400'} />
              <span>Favorites ({counts.favorite})</span>
            </button>
            <button
              type="button"
              onClick={() => setMediaFilter('video')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${mediaFilter === 'video' ? 'bg-amber-400 text-black font-semibold' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
            >
              Videos ({counts.video})
            </button>
            <button
              type="button"
              onClick={() => setMediaFilter('image')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${mediaFilter === 'image' ? 'bg-amber-400 text-black font-semibold' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
            >
              Images ({counts.image})
            </button>
            <button
              type="button"
              onClick={() => setMediaFilter('audio')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${mediaFilter === 'audio' ? 'bg-amber-400 text-black font-semibold' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
            >
              Audio ({counts.audio})
            </button>
          </div>
        )}

        {/* Media Grid */}
        <div className="grid min-h-0 grid-cols-2 gap-3 overflow-auto sm:grid-cols-3 max-h-[46vh] p-1">
          {filteredAssets.map((asset, index) => {
            const compatible = track ? compatibleAsset(track.kind, asset) : true;
            const Icon = asset.mediaType === "audio" ? Music : asset.mediaType === "video" ? Film : ImageIcon;
            return (
              <div key={`${asset.id}_${asset.fileUrl || ''}_${index}`} className="relative min-w-0 group">
                {/* Favorite Star Button */}
                <button
                  type="button"
                  aria-label={asset.isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
                  title={asset.isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const nextFav = !asset.isFavorite;
                    asset.isFavorite = nextFav;
                    try {
                      await fetch('/api/caption-maker/media', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fileUrl: asset.fileUrl, isFavorite: nextFav }),
                      });
                    } catch {}
                  }}
                  className={`absolute left-1.5 top-1.5 z-10 p-1 rounded-md backdrop-blur-md transition-all cursor-pointer ${
                    asset.isFavorite
                      ? 'bg-amber-400/20 text-amber-400 border border-amber-400/60 shadow'
                      : 'bg-black/60 text-zinc-400 hover:text-amber-300 border border-white/10 opacity-70 group-hover:opacity-100 hover:scale-110'
                  }`}
                >
                  <Star size={11} className={asset.isFavorite ? 'fill-amber-400 text-amber-400' : ''} />
                </button>
                <Button
                  type="button"
                  disabled={busy || Boolean(track?.locked) || !compatible}
                  title={compatible ? `Select "${asset.fileName}"` : `${asset.fileName} — incompatible with this track`}
                  onClick={() => onAdd(asset.id)}
                  className="w-full overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 text-left hover:border-amber-400 focus-visible:outline focus-visible:outline-amber-400 disabled:cursor-not-allowed disabled:opacity-50 transition-all p-0 h-auto block"
                >
                  <div className="relative flex h-24 items-center justify-center bg-black/50 overflow-hidden">
                    {asset.mediaType === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={asset.fileUrl} alt="" className="h-full w-full object-contain" loading="lazy"/>
                    ) : asset.mediaType === "video" ? (
                      <video src={asset.fileUrl} className="h-full w-full object-cover pointer-events-none" muted preload="metadata"/>
                    ) : (
                      <Icon size={28} className="text-zinc-500"/>
                    )}
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-black/75 text-zinc-300 uppercase tracking-wider">
                      {asset.mediaType}
                    </span>
                  </div>
                  <div className="space-y-0.5 p-2">
                    <p className="truncate text-xs text-zinc-200 font-medium">{asset.fileName}</p>
                    <p className="text-[10px] text-zinc-500">
                      {asset.durationMs > 0 ? `${(asset.durationMs / 1000).toFixed(1)}s` : "Image"}
                      {!compatible && " · Incompatible"}
                    </p>
                  </div>
                </Button>
                {onDelete && (
                  <Button
                    type="button"
                    disabled={busy || !asset.fileUrl.startsWith("/api/files/")}
                    aria-label={`Delete ${asset.fileName} from library`}
                    title="Permanently delete uploaded media from library and disk"
                    className="absolute right-1.5 top-1.5 rounded-md border border-zinc-700 bg-zinc-950/90 p-1.5 text-zinc-400 hover:border-red-500 hover:text-red-400 disabled:opacity-40 transition-colors shadow-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteModalError(null);
                      setAssetToDelete(asset);
                    }}
                  >
                    <Trash2 size={13}/>
                  </Button>
                )}
              </div>
            );
          })}
          {!filteredAssets.length && (
            <div className="col-span-full py-10 text-center space-y-1">
              <FolderOpen size={32} className="mx-auto text-zinc-600 mb-2 stroke-1" />
              <p className="text-sm font-medium text-zinc-300">
                {imageOnly ? "No images in your library yet" : "No media in your library yet"}
              </p>
              <p className="text-xs text-zinc-500">
                Upload images or videos below. They will be saved to your library and remain available across all reels!
              </p>
            </div>
          )}
        </div>

        {error && <p role="alert" className="text-xs text-red-300 bg-red-950/40 border border-red-900/50 p-2 rounded-lg">{error}</p>}

        {/* Upload Bottom Action */}
        <div className="border-t border-zinc-800 pt-3">
          <input ref={input} type="file" hidden accept={imageOnly ? "image/*,.jpg,.jpeg,.png,.webp,.svg,.gif,.avif,.bmp" : "image/*,video/*,audio/*"}
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }}/>
          <Button type="button" disabled={busy || Boolean(track?.locked)} onClick={() => input.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 font-semibold text-black hover:bg-amber-300 disabled:opacity-50 transition-colors cursor-pointer shadow-md">
            <Upload size={16}/>
            {deleting ? "Deleting media…" : progress !== null ? progress >= 100 ? "Processing media…" : `Uploading ${progress}%…` : imageOnly ? "Upload new image to library" : "Upload new image or video to library"}
          </Button>
          <p className="mt-2 text-center text-[11px] text-zinc-500">
            Uploaded files persist in your library across reels until you explicitly delete them.
          </p>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(assetToDelete)}
        onClose={() => {
          if (!deleting) {
            setAssetToDelete(null);
            setDeleteModalError(null);
          }
        }}
        onConfirm={confirmDelete}
        itemName={assetToDelete?.fileName || "Media file"}
        itemType={assetToDelete?.mediaType || "media"}
        isDeleting={Boolean(deleting)}
        error={deleteModalError}
      />
    </div>
  );
}
