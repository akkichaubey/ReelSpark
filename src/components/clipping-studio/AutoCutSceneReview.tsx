'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { validateAutoCutScenes, type AutoCutScene } from '@/lib/auto-cut/types';

function editedRange(scene: AutoCutScene, startMs: number, endMs: number): AutoCutScene {
  return {
    ...scene, startMs, endMs, provenance: 'manual', shotType: 'manual', confidence: 0,
    evidenceFrames: scene.evidenceFrames.filter(time => time >= startMs && time < endMs),
    semanticActions: scene.semanticActions.filter(action => action.startMs < endMs && action.endMs > startMs)
      .map(action => ({ ...action, startMs: Math.max(startMs, action.startMs), endMs: Math.min(endMs, action.endMs) })),
    thumbnail: undefined,
  };
}

export function AutoCutSceneReview({ scenes, durationMs, playheadMs, onChange, onPreview, onApply }: {
  scenes: AutoCutScene[];
  durationMs: number;
  playheadMs: number;
  onChange: (scenes: AutoCutScene[]) => void;
  onPreview: (scene: AutoCutScene) => void;
  onApply: () => void;
}) {
  const [error, setError] = useState('');
  const update = (index: number, count: number, replacements: AutoCutScene[]) => {
    try {
      const next = [...scenes];
      next.splice(index, count, ...replacements);
      onChange(validateAutoCutScenes(next, scenes[0].sourceVideoId, durationMs));
      setError('');
    } catch {
      setError('Use non-overlapping scene boundaries within the source video.');
    }
  };

  return (
    <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-white">Scene review · {scenes.length} scenes</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-zinc-400">Review source scenes and apply the included ranges to your reel draft.</p>
        <Button type="button" variant="secondary" size="sm" onClick={onApply} disabled={scenes.every(scene => scene.excluded)}>Use included scenes in draft</Button>
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        <ul className="max-h-[32rem] space-y-2 overflow-y-auto">
          {scenes.map((scene, index) => {
            const next = scenes[index + 1];
            const atPlayhead = playheadMs > scene.startMs && playheadMs < scene.endMs;
            const splitMs = atPlayhead ? playheadMs : Math.floor((scene.startMs + scene.endMs) / 2);
            return (
              <li key={scene.sceneId} className="space-y-2 rounded-lg border border-zinc-800 p-3">
                <div className="flex items-center gap-3">
                  {scene.thumbnail && <img src={scene.thumbnail} alt="" className="h-12 w-20 rounded object-cover" />}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white">{scene.description}</p>
                    <p className="text-[11px] text-zinc-400">{scene.shotType.replaceAll('_', ' ')} · {scene.confidence ? `${Math.round(scene.confidence)}% boundary confidence` : 'No measured boundary confidence'}</p>
                    {scene.motionDetected && <p className="text-[11px] text-zinc-400">Motion detected</p>}
                    {scene.actionTags.length > 0 && <p className="text-[11px] text-zinc-400">Actions · {scene.actionTags.join(', ')}</p>}
                    {scene.objects.length > 0 && <p className="text-[11px] text-zinc-400">Objects · {scene.objects.join(', ')}</p>}
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => onPreview(scene)}>Preview</Button>
                </div>
                <form key={`${scene.startMs}:${scene.endMs}`} className="flex flex-wrap items-end gap-2" onSubmit={event => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  update(index, 1, [editedRange(scene, Math.round(Number(data.get('start')) * 1000), Math.round(Number(data.get('end')) * 1000))]);
                }}>
                  <label className="text-[11px] text-zinc-300">Start (s)
                    <input name="start" required type="number" min={0} max={durationMs / 1000} step="0.001" defaultValue={scene.startMs / 1000} disabled={scene.locked} className="ml-1 w-20 rounded border border-zinc-700 bg-zinc-950 p-1" />
                  </label>
                  <label className="text-[11px] text-zinc-300">End (s)
                    <input name="end" required type="number" min={0} max={durationMs / 1000} step="0.001" defaultValue={scene.endMs / 1000} disabled={scene.locked} className="ml-1 w-20 rounded border border-zinc-700 bg-zinc-950 p-1" />
                  </label>
                  <Button type="submit" variant="ghost" size="sm" disabled={scene.locked}>Apply trim</Button>
                </form>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => update(index, 1, [{ ...scene, locked: !scene.locked }])}>{scene.locked ? 'Unlock' : 'Lock'}</Button>
                  <Button type="button" variant="ghost" size="sm" disabled={scene.locked} onClick={() => update(index, 1, [{ ...scene, excluded: !scene.excluded }])}>{scene.excluded ? 'Restore' : 'Exclude'}</Button>
                  <Button type="button" variant="ghost" size="sm" disabled={scene.locked || splitMs <= scene.startMs} onClick={() => update(index, 1, [
                    editedRange(scene, scene.startMs, splitMs),
                    { ...editedRange(scene, splitMs, scene.endMs), sceneId: crypto.randomUUID() },
                  ])}>{atPlayhead ? 'Split at playhead' : 'Split in half'}</Button>
                  <Button type="button" variant="ghost" size="sm" disabled={scene.locked || !next || next.locked || scene.excluded !== next.excluded} onClick={() => {
                    if (next) update(index, 2, [editedRange({
                      ...scene,
                      evidenceFrames: [...scene.evidenceFrames, ...next.evidenceFrames],
                      semanticActions: [...scene.semanticActions, ...next.semanticActions],
                      actionTags: [...new Set([...scene.actionTags, ...next.actionTags])],
                      objects: [...new Set([...scene.objects, ...next.objects])],
                      visionProviders: [...new Set([...scene.visionProviders, ...next.visionProviders])],
                      motionDetected: scene.motionDetected || next.motionDetected,
                    }, scene.startMs, next.endMs)]);
                  }}>Merge with next</Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
