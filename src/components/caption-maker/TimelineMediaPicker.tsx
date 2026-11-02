"use client";

import { Button } from '@/components/ui/button';
import { useEffect, useRef, useState } from "react";
import { Film, ImageIcon, Music, Upload, Trash2, X } from "lucide-react";
import { uploadFileWithProgress, UploadCancelledError } from "@/lib/upload-with-progress";
import type { AudioAsset, ImageAsset } from "@/lib/caption-maker/types";
import { compatibleAsset, type TimelineAsset, type TimelineTrack } from "@/lib/timeline/model";

export function TimelineMediaPicker({ track, assets, onAdd, onUpload, onDelete, onClose }: {
  track: TimelineTrack;
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
  const busy = progress !== null || deleting !== null;

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
      const type = file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name)
        ? "image" : file.type.startsWith("video/") || /\.(mp4|mov|webm|mkv)$/i.test(file.name) ? "video" : "audio";
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
        <div className="flex items-center justify-between gap-3">
          <div><h2 id="timeline-media-title" className="text-base font-semibold text-amber-300">Reel media</h2>
            <p className="mt-1 text-xs text-zinc-400">Choose media for {track.name}</p></div>
          <Button type="button" aria-label="Close media picker" onClick={onClose} className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"><X size={18}/></Button>
        </div>
        <div className="grid min-h-0 grid-cols-2 gap-3 overflow-auto sm:grid-cols-3">
          {assets.map(asset => {
            const compatible = compatibleAsset(track.kind, asset);
            const Icon = asset.mediaType === "audio" ? Music : asset.mediaType === "video" ? Film : ImageIcon;
            return <div key={asset.id} className="relative min-w-0"><Button type="button" disabled={busy || track.locked || !compatible}
              title={compatible ? asset.fileName : `${asset.fileName} — choose a compatible track`}
              onClick={() => onAdd(asset.id)}
              className="w-full overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 text-left hover:border-amber-400 focus-visible:outline focus-visible:outline-amber-400 disabled:cursor-not-allowed disabled:opacity-50">
              <div className="flex h-24 items-center justify-center bg-black/40">
                {asset.mediaType === "image" ? (
                  // Uploaded files are served by the existing authenticated media endpoint.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.fileUrl} alt="" className="h-full w-full object-contain" loading="lazy"/>
                ) : <Icon size={28} className="text-zinc-500"/>}
              </div>
              <div className="space-y-1 p-2"><p className="truncate text-xs text-zinc-200">{asset.fileName}</p>
                <p className="text-[10px] text-zinc-500">{asset.mediaType}{asset.durationMs > 0 ? ` · ${(asset.durationMs / 1000).toFixed(1)}s` : ""}</p>
                {!compatible && <p className="text-[10px] text-zinc-500">Use a compatible track</p>}
              </div>
            </Button>
            {onDelete && <Button type="button" disabled={busy || !asset.fileUrl.startsWith("/api/files/")}
              aria-label={`Delete ${asset.fileName} from reel`}
              title="Permanently delete uploaded media and its timeline clips"
              className="absolute right-1.5 top-1.5 rounded-md border border-zinc-700 bg-zinc-950/90 p-2 text-zinc-300 hover:border-red-400 hover:text-red-300 disabled:opacity-40"
              onClick={async () => {
                if (!window.confirm(`Permanently delete "${asset.fileName}" and its timeline clips? The uploaded file will be deleted from storage. This cannot be undone.`)) return;
                setDeleting(asset.id);
                try { await onDelete(asset.id); setError(""); }
                catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to remove media."); }
                finally { setDeleting(null); }
              }}><Trash2 size={14}/></Button>}
            </div>;
          })}
          {!assets.length && <p className="col-span-full py-8 text-center text-zinc-400">No media in this reel yet. Upload a file to get started.</p>}
        </div>
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        <div className="border-t border-zinc-800 pt-3">
          <input ref={input} type="file" hidden accept="image/*,video/*,audio/*"
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }}/>
          <Button type="button" disabled={busy || track.locked} onClick={() => input.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 font-semibold text-black hover:bg-amber-300 disabled:opacity-50"><Upload size={16}/>
            {deleting ? "Deleting media…" : progress !== null ? progress >= 100 ? "Processing media…" : `Uploading ${progress}%…` : "Upload new media"}
          </Button>
          {progress !== null && <p role="status" className="mt-2 text-xs text-zinc-400">Your upload will appear in this reel’s media library. Close this popup to cancel.</p>}
        </div>
      </div>
    </div>
  );
}
