'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { qualityDimensions, qualityLabels, qualityPreferences, qualityProfiles, qualityWeights, scoreAutoCutQuality, type QualityConfig } from '@/lib/auto-cut/quality';
import type { AutoCutClipCandidate, AutoCutSettings } from '@/lib/auto-cut/types';
import { qualityRedundancy, type DuplicateCluster } from '@/lib/auto-cut/duplicates';

export function AutoCutQualityReview({ clips, config, mode, clusters, sources, onChange, onApply, onPreview }: {
  clips: AutoCutClipCandidate[];
  config: QualityConfig;
  mode: AutoCutSettings['mode'];
  clusters: DuplicateCluster[];
  sources: Record<string, string>;
  onChange: (config: QualityConfig) => void;
  onApply: () => void;
  onPreview: (clip: AutoCutClipCandidate, timeMs?: number) => void;
}) {
  const [selected, setSelected] = useState('');
  const weights = qualityWeights(config, mode);
  const settings = useMemo(() => ({ mode, quality: config }), [mode, config]);
  const scored = useMemo(() => {
    const redundancy = qualityRedundancy(clusters);
    return clips.map(clip => ({ clip, result: scoreAutoCutQuality(clip, settings, redundancy.get(clip.id)) }));
  }, [clips, settings, clusters]);
  const current = scored.find(item => item.clip.id === selected) ?? scored[0];
  const label = (clip: AutoCutClipCandidate) => `${sources[clip.sourceVideoId ?? ''] ?? 'Active source'} · ${(clip.startMs / 1000).toFixed(2)} s · ${clip.category}`;
  const cluster = clusters.find(group => group.preferred.id === current?.clip.id || group.alternatives.some(item => item.clip.id === current?.clip.id));
  const alternatives = cluster ? [cluster.preferred, ...cluster.alternatives.map(item => item.clip)]
    .filter(clip => clip.id !== current?.clip.id)
    .map(clip => scored.find(item => item.clip.id === clip.id))
    .filter(item => item?.result.total !== undefined)
    .sort((a, b) => b!.result.total! - a!.result.total!).slice(0, 3) : [];
  const details = current?.result.details ?? [];
  const strengths = details.filter(item => item.score >= 75).map(item => qualityLabels[item.dimension]);
  const weaknesses = details.filter(item => item.score < 45).map(item => qualityLabels[item.dimension]);
  return <details className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
    <summary className="cursor-pointer text-sm font-semibold text-white">Quality scoring · v{config.version}</summary>
    <p className="text-xs text-zinc-400">Scores guide editing choices. Unmeasured dimensions do not count toward the total.</p>
    <div className="flex flex-wrap items-end gap-3 text-xs">
      <label className="space-x-2">Scoring profile
        <select aria-label="Scoring profile" className="rounded border border-zinc-700 bg-zinc-950 p-1" value={config.profile ?? ''}
          onChange={event => onChange({ ...config, profile: (event.target.value || undefined) as QualityConfig['profile'] })}>
          <option value="">Follow editing mode</option>
          {qualityProfiles.map(profile => <option key={profile}>{profile}</option>)}
        </select>
      </label>
      <label className="space-x-2">Prioritize
        <select aria-label="Quality priority" className="rounded border border-zinc-700 bg-zinc-950 p-1" value={config.preference}
          onChange={event => onChange({ ...config, preference: event.target.value as QualityConfig['preference'] })}>
          {qualityPreferences.map(preference => <option key={preference}>{preference}</option>)}
        </select>
      </label>
      <Button type="button" variant="secondary" size="sm" onClick={onApply} disabled={!scored.some(item => item.result.total !== undefined)}>Rebuild with quality scores</Button>
    </div>
    <details className="space-y-2 text-xs">
      <summary className="cursor-pointer">Adjust scoring weights</summary>
      <div className="grid gap-2 sm:grid-cols-2">
        {qualityDimensions.map(dimension => <label key={dimension} className="flex items-center justify-between gap-2">
          {qualityLabels[dimension]}
          <input type="number" min={0} max={100} step="any" placeholder={String(Math.round(weights[dimension] * 10) / 10)}
            value={config.weights?.[dimension] ?? ''} className="w-16 rounded border border-zinc-700 bg-zinc-950 p-1"
            onChange={event => {
              const next = { ...config.weights };
              if (!event.target.value) delete next[dimension];
              else if (event.target.valueAsNumber >= 0 && event.target.valueAsNumber <= 100) next[dimension] = event.target.valueAsNumber;
              onChange({ ...config, weights: next });
            }} />
        </label>)}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...config, weights: undefined })}>Reset weights</Button>
    </details>
    {current && <div className="space-y-2 border-t border-zinc-800 pt-2 text-xs">
      <label className="block">Inspect a shot
        <select aria-label="Inspect a shot" className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 p-1"
          value={current.clip.id} onChange={event => setSelected(event.target.value)}>
          {scored.map(({ clip, result }) => <option key={clip.id} value={clip.id}>{label(clip)} · {result.total === undefined ? 'Unscored' : result.total + '/100'}</option>)}
        </select>
      </label>
      <p className="font-semibold">{current.result.total === undefined ? 'Insufficient evidence' : `Quality score ${current.result.total}/100`}</p>
      {strengths.length > 0 && <p className="text-zinc-300">Strengths · {strengths.join(', ')}</p>}
      {weaknesses.length > 0 && <p className="text-zinc-300">Weaknesses · {weaknesses.join(', ')}</p>}
      <ul className="space-y-1">
        {qualityDimensions.map(dimension => {
          const item = details.find(detail => detail.dimension === dimension);
          return <li key={dimension} className="rounded border border-zinc-800 p-2">
            <p>{qualityLabels[dimension]} · {item ? `${item.score}/100 · ${item.provenance}` : 'No evidence'}</p>
            {item && <p className="text-zinc-400">{item.reason}</p>}
            {item && item.timestamps.length > 0 && <Button type="button" variant="ghost" size="sm"
              onClick={() => onPreview(current.clip, item.timestamps[0])}>Review evidence · {item.timestamps.map(time => (time / 1000).toFixed(2)).join(', ')} s</Button>}
          </li>;
        })}
      </ul>
      {alternatives.length > 0 && <div className="space-y-1">
        <p className="font-semibold">Related shots to compare</p>
        {alternatives.map(item => item && <Button key={item.clip.id} type="button" variant="ghost" size="sm"
          onClick={() => { setSelected(item.clip.id); onPreview(item.clip); }}>{label(item.clip)} · {item.result.total}/100</Button>)}
      </div>}
    </div>}
  </details>;
}
