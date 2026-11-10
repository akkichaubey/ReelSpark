'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { duplicateDecision, type DuplicateCluster, type DuplicateDecision } from '@/lib/auto-cut/duplicates';
import type { AutoCutClipCandidate } from '@/lib/auto-cut/types';

type Clip = AutoCutClipCandidate;

export function AutoCutDuplicateReview({ clusters, decisions, sources, onPreview, onDecide, onRestore }: {
  clusters: DuplicateCluster[];
  decisions: DuplicateDecision[];
  sources: Record<string, string>;
  onPreview: (clip: Clip) => void;
  onDecide: (changes: { clip: Clip; value: DuplicateDecision['value'] }[]) => void;
  onRestore: (decision: DuplicateDecision) => void;
}) {
  const [comparison, setComparison] = useState<{ preferred: Clip; alternative: Clip }>();
  const label = (clip: Pick<Clip, 'sourceVideoId' | 'startMs' | 'endMs'>) =>
    `${sources[clip.sourceVideoId ?? ''] ?? 'Active source'} · ${(clip.startMs / 1000).toFixed(2)}–${(clip.endMs / 1000).toFixed(2)} s`;
  const controls = (clip: Clip) => {
    const status = duplicateDecision(clip, decisions);
    return <div className="flex flex-wrap items-center gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={() => onPreview(clip)}>Preview</Button>
      <Button type="button" variant="outline" size="sm" aria-pressed={status === 'keep'}
        onClick={() => onDecide([{ clip, value: 'keep' }])}>Keep</Button>
      <Button type="button" variant="outline" size="sm" aria-pressed={status === 'exclude'}
        onClick={() => onDecide([{ clip, value: 'exclude' }])}>Exclude</Button>
    </div>;
  };
  return <details className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
    <summary className="cursor-pointer text-sm font-semibold text-white">Duplicate review · {clusters.length}</summary>
    <p className="text-xs text-zinc-400">Matches are suggestions. Excluding a range changes this edit and leaves the source media available.</p>
    {comparison && <div className="flex flex-wrap gap-2 text-xs">
      <Button type="button" size="sm" variant="secondary" onClick={() => onPreview(comparison.preferred)}>Play preferred</Button>
      <Button type="button" size="sm" variant="secondary" onClick={() => onPreview(comparison.alternative)}>Play alternate</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setComparison(undefined)}>Close comparison</Button>
    </div>}
    {!clusters.length && <p className="text-xs text-zinc-400">No supported matches were found in the sampled ranges.</p>}
    <ul className="max-h-[32rem] space-y-2 overflow-auto">
      {clusters.map(({ preferred, alternatives }) => <li key={preferred.id} className="space-y-2 rounded border border-zinc-800 p-3 text-xs">
        <p className="font-semibold">Preferred · {label(preferred)}</p>
        {controls(preferred)}
        {alternatives.map(({ clip, match }) => <div key={clip.id} className="space-y-1 border-t border-zinc-800 pt-2">
          <p>{label(clip)}</p>
          <p className="text-amber-300">{match.kind} · {match.confidence}% match score</p>
          <p className="text-zinc-400">{match.reason}</p>
          {controls(clip)}
          <div className="flex flex-wrap gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => {
              setComparison({ preferred, alternative: clip });
              onPreview(preferred);
            }}>Compare</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() =>
              onDecide([{ clip: preferred, value: 'exclude' }, { clip, value: 'keep' }])}>Replace preferred</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() =>
              onDecide([{ clip: preferred, value: 'keep' }, { clip, value: 'keep' }])}>Keep Both</Button>
          </div>
        </div>)}
      </li>)}
    </ul>
    {decisions.length > 0 && <details className="space-y-2 text-xs">
      <summary className="cursor-pointer">Saved decisions · {decisions.length}</summary>
      {decisions.map(decision => <div key={JSON.stringify(decision)} className="flex flex-wrap items-center gap-2">
        <span>{decision.value === 'keep' ? 'Keep' : 'Excluded'} · {label(decision)}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onRestore(decision)}>Reset decision</Button>
      </div>)}
    </details>}
  </details>;
}
