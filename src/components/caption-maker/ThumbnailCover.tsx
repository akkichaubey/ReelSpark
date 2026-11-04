'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { CaptionProject, ThumbnailSettings } from '@/lib/caption-maker/types';
import { createThumbnailCoverDataUrl } from '@/lib/caption-maker/thumbnail-cover';

export function useThumbnailCover(project: CaptionProject, settings: ThumbnailSettings) {
  const enabled = project.thumbnailCover?.enabled === true;
  const customBgUrl = project.thumbnailCover?.customBgUrl;
  const image = project.image;
  const outputSettings = project.outputSettings;
  const source = useMemo(() => ({ image, outputSettings, thumbnailCover: { enabled, customBgUrl }, settings }), [image, outputSettings, enabled, customBgUrl, settings]);
  const [result, setResult] = useState<{ url: string; error: string; source?: typeof source }>({ url: '', error: '' });
  useEffect(() => {
    let cancelled = false;
    if (enabled) {
      void createThumbnailCoverDataUrl(source, source.settings)
        .then(url => { if (!cancelled) setResult({ url, error: '', source }); })
        .catch(error => { if (!cancelled) setResult({ url: '', error: error instanceof Error ? error.message : 'Thumbnail unavailable.', source }); });
    }
    return () => { cancelled = true; };
  }, [enabled, source]);
  return enabled && result.source === source ? result : { url: '', error: '' };
}

export function ThumbnailPoster({ url, onPlay }: { url?: string; onPlay: () => void }) {
  if (!url) return null;
  return <Button type="button" aria-label="Play video from thumbnail" data-thumbnail-poster="true"
    className="absolute inset-0 z-20 flex h-full w-full items-center justify-center bg-black p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400" onClick={onPlay}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={url} alt="Video thumbnail" className="h-full w-full object-contain" draggable={false} />
  </Button>;
}

export function ThumbnailCoverControls({ enabled, url, error, onChange, onEdit }: {
  enabled: boolean; url?: string; error?: string;
  onChange: (cover: NonNullable<CaptionProject['thumbnailCover']>) => void; onEdit: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState('');
  return <div data-thumbnail-cover-slot="true" className="flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2 text-xs">
    {enabled && url && <div data-theme-media="true" className="h-10 w-8 overflow-hidden rounded bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Opening thumbnail" className="h-full w-full object-contain" />
    </div>}
    <div className="mr-auto"><strong>Thumbnail</strong><p className="text-[10px] text-zinc-400">{enabled ? '0.01s cover · before playback · tracks stay synchronized' : 'Add a cover before your video'}</p></div>
    {enabled && !url && !error && <span role="status">Preparing thumbnail…</span>}
    <Button type="button" variant="default" size="sm" onClick={onEdit}>{enabled ? 'Edit thumbnail' : 'Add thumbnail'}</Button>
    <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>Replace thumbnail</Button>
    {enabled && <Button type="button" variant="ghost" size="sm" aria-label="Remove thumbnail" onClick={() => onChange({ enabled: false })}>Remove</Button>}
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Replace thumbnail image" onChange={async event => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
      if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setUploadError('Choose a PNG, JPG or WebP image up to 5 MB.'); return; }
      try {
        const imageUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read thumbnail.')); reader.readAsDataURL(file); });
        // Decode before committing: invalid image bytes must not replace the current cover.
        const image = new Image(); image.src = imageUrl; await image.decode();
        onChange({ enabled: true, customBgUrl: imageUrl }); setUploadError('');
      } catch { setUploadError('Could not read thumbnail image.'); }
    }} />
    {(uploadError || error) && <p role="alert" className="w-full text-red-400">{uploadError || error}</p>}
  </div>;
}
