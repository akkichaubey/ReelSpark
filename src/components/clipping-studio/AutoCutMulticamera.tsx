'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getMediaAssetWebUrl, type MediaAsset } from '@/lib/clipping-studio/contracts';
import type { CameraSync } from '@/lib/auto-cut/multicamera';
import { recommendCamera, switchCameraRange } from '@/lib/auto-cut/multicamera';
import type { AutoCutClipCandidate } from '@/lib/auto-cut/types';

export function AutoCutMulticamera({ assets, sync, master, clips, evidence, synchronized, busy, error, onSync, onCancel, onManual, onMaster, onSwitch, onMove, onLock, onPreview, onPreviewDraft, onRecommend }: {
  assets: MediaAsset[]; sync: CameraSync; master: string; clips: AutoCutClipCandidate[]; synchronized: boolean;
  busy: boolean; error: string; onSync: () => void; onCancel: () => void; onManual: (id: string, offset: number) => void;
  onMaster: (id: string) => void; onSwitch: (clip: AutoCutClipCandidate, asset: MediaAsset, offset: number) => void;
  onMove: (id: string, direction: number) => void; onLock: (id: string) => void;
  evidence: AutoCutClipCandidate[]; onPreview: (clip: AutoCutClipCandidate) => void;
  onPreviewDraft: () => void;
  onRecommend: () => void;
}) {
  const [shotId, setShotId] = useState('');
  const [alternateId, setAlternateId] = useState('');
  const [compare, setCompare] = useState(false);
  const shot = clips.find(clip => clip.id === shotId) ?? clips[0];
  const alternate = assets.find(asset => asset.id === alternateId && asset.id !== shot?.sourceVideoId);
  const recommendation = synchronized && shot ? recommendCamera(shot, assets, evidence, sync) : undefined;
  const comparison = (() => {
    const current = assets.find(asset => asset.id === shot?.sourceVideoId);
    if (!compare || !shot || !current || !alternate) return [];
    try {
      return [{ asset: current, time: shot.startMs }, { asset: alternate, time: switchCameraRange(shot, alternate, sync, 0)[0].startMs }];
    } catch { return []; }
  })();
  return <details open className="space-y-2 rounded-xl border border-zinc-800 p-3 text-xs">
    <summary className="cursor-pointer font-semibold">Multi-Camera Cinematic</summary>
    {synchronized && <>
      <Button size="sm" type="button" disabled={busy || assets.length < 2} onClick={onSync}>Find audio sync</Button>
      {busy && <Button size="sm" type="button" variant="ghost" onClick={onCancel}>Cancel sync</Button>}
      <p className="text-zinc-400">Manual sync uses the same event in both recordings. Enter its timestamp in each camera.</p>
      {assets.map(asset => <form key={asset.id} className="space-y-1 rounded border border-zinc-800 p-2" onSubmit={event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const offset = Math.round((Number(form.get('reference')) - Number(form.get('camera'))) * 1000);
        if (Number.isSafeInteger(offset) && Math.abs(offset) <= 14400000) onManual(asset.id, offset);
      }}>
        <p>{asset.filename} · {asset.metadata.width ?? '?'}×{asset.metadata.height ?? '?'} · {asset.metadata.fps ?? '?'} fps</p>
        <p>{sync[asset.id] ? `${sync[asset.id].offsetMs} ms · ${sync[asset.id].method}${sync[asset.id].method === 'waveform' ? ' · ' + sync[asset.id].confidence + '% match' : ''}${sync[asset.id].driftMs !== undefined ? ' · later drift ' + sync[asset.id].driftMs + ' ms' : ''}` : 'Unverified offset'}</p>
        <div className="flex flex-wrap gap-2">
          <label>Reference time (s) <input type="number" name="reference" min={0} step="0.001" required className="w-20 rounded bg-zinc-950 p-1" /></label>
          <label>Camera time (s) <input type="number" name="camera" min={0} max={asset.metadata.durationMs / 1000} step="0.001" required className="w-20 rounded bg-zinc-950 p-1" /></label>
          <Button size="sm" type="submit" variant="ghost" disabled={busy}>Set sync point</Button>
        </div>
      </form>)}
      <Select value={master || undefined} onValueChange={onMaster}>
        <SelectTrigger aria-label="Master camera audio"><SelectValue placeholder="Choose master camera audio" /></SelectTrigger>
        <SelectContent>{assets.filter(asset => asset.metadata.hasAudio && sync[asset.id]).map(asset =>
          <SelectItem key={asset.id} value={asset.id}>{asset.filename}</SelectItem>)}</SelectContent>
      </Select>
    </>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {!!clips.length && <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onPreviewDraft}>Preview cinematic draft</Button>}
    {synchronized && !!clips.length && <Button type="button" size="sm" variant="ghost" disabled={busy || assets.filter(asset => sync[asset.id]).length < 2}
      onClick={onRecommend}>Apply best supported angles</Button>}
    {clips.length > 0 && <ol className="max-h-48 space-y-1 overflow-auto">
      {clips.map((clip, index) => <li key={clip.id} className="flex flex-wrap items-center gap-1">
        <span>{index + 1}. {assets.find(asset => asset.id === clip.sourceVideoId)?.filename} · {(clip.startMs / 1000).toFixed(2)}–{(clip.endMs / 1000).toFixed(2)} s · {clip.category}</span>
        <Button type="button" size="sm" variant="ghost" onClick={() => setShotId(clip.id)}>Select shot</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onPreview(clip)}>Preview shot</Button>
        <Button type="button" size="sm" variant="ghost" disabled={clip.locked || index === 0} onClick={() => onMove(clip.id, -1)}>Earlier</Button>
        <Button type="button" size="sm" variant="ghost" disabled={clip.locked || index === clips.length - 1} onClick={() => onMove(clip.id, 1)}>Later</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onLock(clip.id)}>{clip.locked ? 'Unlock' : 'Lock'} shot</Button>
      </li>)}
    </ol>}
    {synchronized && shot && <form className="space-y-2" onSubmit={event => {
      event.preventDefault();
      if (alternate) onSwitch(shot, alternate, Math.round(Number(new FormData(event.currentTarget).get('position')) * 1000));
    }}>
      <p>Switch angle in {shot.category}</p>
      {recommendation && <p>{recommendation.asset.filename} · quality {recommendation.score}/100{recommendation.framing ? ' · ' + recommendation.framing : ''}
        <Button type="button" size="sm" variant="ghost" onClick={() => onSwitch(shot, recommendation.asset, 0)}>Use recommended angle</Button></p>}
      <Select value={alternate?.id} onValueChange={setAlternateId}>
        <SelectTrigger aria-label="Alternate camera"><SelectValue placeholder="Choose alternate camera" /></SelectTrigger>
        <SelectContent>{assets.filter(asset => asset.id !== shot.sourceVideoId && sync[asset.id]).map(asset =>
          <SelectItem value={asset.id} key={asset.id}>{asset.filename}</SelectItem>)}</SelectContent>
      </Select>
      <label>Seconds into shot <input key={shot.id} name="position" type="number" step="0.001" min={0} max={Math.max(0, shot.durationMs / 1000 - 0.1)}
        defaultValue={0} required className="ml-1 w-20 rounded bg-zinc-950 p-1" /></label>
      <Button type="submit" size="sm" disabled={!alternate || shot.locked}>Switch angle</Button>
      <Button type="button" size="sm" variant="ghost" disabled={!alternate} onClick={() => setCompare(value => !value)}>
        {compare ? 'Close camera comparison' : 'Compare synchronized frames'}</Button>
      {compare && !comparison.length && <p>Both cameras must cover the selected range with verified offsets.</p>}
      {!!comparison.length && <div className="grid grid-cols-2 gap-2">
        {comparison.map(({ asset, time }) => <figure key={asset.id + ':' + time}>
          <video src={getMediaAssetWebUrl(asset)} muted playsInline preload="auto" className="aspect-video w-full bg-black object-contain"
            onLoadedMetadata={event => { event.currentTarget.currentTime = time / 1000; }} />
          <figcaption>{asset.filename} · {(time / 1000).toFixed(2)} s</figcaption>
        </figure>)}
      </div>}
    </form>}
  </details>;
}
