'use client';
import type { TimelineClip, TimelineAsset } from '@/lib/timeline/model';
import { setAudioKeyframe } from '@/lib/timeline/audio';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AudioClipInspector({ clip, asset, currentMs, fps, music, canDetach, onDetach, onResync, onChange }: {
  clip: TimelineClip; asset?: TimelineAsset; currentMs: number; fps: number; music: boolean;
  canDetach: boolean; onDetach: () => void; onResync: () => void; onChange: (clip: TimelineClip) => void;
}) {
  let sourceTime = clip.sourceStartMs + currentMs - clip.startMs;
  if (clip.loop && asset?.durationMs) sourceTime %= asset.durationMs;
  const inside = currentMs >= clip.startMs && currentMs < clip.startMs + clip.durationMs;
  return <fieldset className="space-y-3 rounded-lg border border-zinc-700 p-3">
    <legend className="px-1 font-semibold">Audio automation</legend>
    <div className="grid grid-cols-2 gap-3">
      {(['audioFadeInMs', 'audioFadeOutMs'] as const).map((key, i) => <label key={key}>
        Audio fade {i === 0 ? 'in' : 'out'} (seconds)
        <Input type="number" min={0} max={clip.durationMs / 1000} step={1 / fps}
          value={(clip[key] ?? (i === 0 ? clip.fadeInMs : clip.fadeOutMs)) / 1000}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 p-2"
          onChange={e => onChange({ ...clip, [key]: Math.round(Number(e.target.value) * 1000) })} />
      </label>)}
    </div>
    {music && <label className="flex items-center gap-2"><input type="checkbox" checked={clip.ducking !== false} onChange={e => onChange({ ...clip, ducking: e.target.checked })} />Duck music while speech captions are active</label>}
    <p className="text-zinc-400">Keyframes follow source time through trim, split and slip edits. Gain is a multiplier of clip volume; output is capped at 200%.</p>
    <Button type="button" variant="outline" size="sm" disabled={!inside || (clip.audioKeyframes?.length || 0) >= 1000}
      title="Place the playhead inside this clip to add or replace a keyframe"
      onClick={() => onChange(setAudioKeyframe(clip, sourceTime, 1, fps))}>Add keyframe at playhead</Button>
    <div className="max-h-44 space-y-2 overflow-auto">
      {(clip.audioKeyframes || []).map(key => <div key={key.timeMs} className="flex items-center gap-2">
        <span className="font-mono">Source {(key.timeMs / 1000).toFixed(2)}s</span>
        <Input aria-label={`Gain at source ${(key.timeMs / 1000).toFixed(2)} seconds (%)`} type="number" min={0} max={200} step={1} value={Math.round(key.gain * 100)}
          className="w-20 rounded border border-zinc-700 bg-zinc-900 p-1"
          onChange={e => onChange({ ...clip, audioKeyframes: clip.audioKeyframes!.map(k => k.timeMs === key.timeMs ? { ...k, gain: Number(e.target.value) / 100 } : k) })} />
        <Button type="button" variant="ghost" size="sm" aria-label={`Delete keyframe at source ${key.timeMs / 1000} seconds`}
          onClick={() => onChange({ ...clip, audioKeyframes: clip.audioKeyframes!.filter(k => k.timeMs !== key.timeMs) })}>Delete</Button>
      </div>)}
    </div>
    {asset?.mediaType === 'video' && <Button type="button" variant="outline" size="sm" disabled={!canDetach} onClick={onDetach}>Detach audio · keep linked to video</Button>}
    {clip.detachedFromId && <Button type="button" variant="outline" size="sm" onClick={onResync}>Resync with original video</Button>}
  </fieldset>;
}
