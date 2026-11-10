'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { naturalTransitionKinds, naturalTransitionNames, suggestTransition, type NaturalTransitionConfig } from '@/lib/auto-cut/natural-transitions';
import type { AutoCutClipCandidate } from '@/lib/auto-cut/types';

const profiles = { none: 'None', natural: 'Natural', cinematic: 'Cinematic', fast: 'Fast-Paced' };
const blendDuration = (input: HTMLInputElement, fallback: number) => {
  const value = Number.isFinite(input.valueAsNumber) ? Math.max(67, Math.min(600, Math.round(input.valueAsNumber))) : fallback;
  input.value = String(value);
  return value;
};

export function AutoCutTransitionReview({ clips, config, onChange, onPreview }: {
  clips: AutoCutClipCandidate[];
  config: NaturalTransitionConfig;
  onChange: (config: NaturalTransitionConfig) => void;
  onPreview: (index: number) => void;
}) {
  const [index, setIndex] = useState(1);
  const position = Math.min(index, clips.length - 1);
  const proposal = position > 0 ? suggestTransition(clips[position - 1], clips[position], config) : undefined;
  const override = proposal ? config.overrides[proposal.key] : undefined;
  return <details className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
    <summary className="cursor-pointer text-sm font-semibold">Natural transitions</summary>
    <p className="text-xs text-zinc-400">Blends overlap selected footage and shorten the draft by the overlap.</p>
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Select value={config.profile} onValueChange={value => onChange({ ...config, profile: value as NaturalTransitionConfig['profile'] })}>
        <SelectTrigger aria-label="Transition profile" className="w-36"><SelectValue /></SelectTrigger>
        <SelectContent>{Object.entries(profiles).map(([value, name]) => <SelectItem value={value} key={value}>{name}</SelectItem>)}</SelectContent>
      </Select>
      <label>Default blend (ms) <input type="number" min={67} max={600} key={config.durationMs} defaultValue={config.durationMs}
        onBlur={event => onChange({ ...config, durationMs: blendDuration(event.currentTarget, config.durationMs) })}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        className="w-20 rounded bg-zinc-950 p-1" /></label>
    </div>
    {proposal && <>
      <Select value={String(position)} onValueChange={value => setIndex(Number(value))}>
        <SelectTrigger aria-label="Transition boundary"><SelectValue /></SelectTrigger>
        <SelectContent>{clips.slice(1).map((clip, i) => <SelectItem key={clip.id} value={String(i + 1)}>
          {i + 1}. {clips[i].category} → {clip.category}
        </SelectItem>)}</SelectContent>
      </Select>
      <p className="text-xs text-zinc-300">{naturalTransitionNames[proposal.kind]} · {proposal.reason}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Select disabled={config.profile === 'none'} value={override?.kind ?? 'auto'} onValueChange={value => {
          const overrides = { ...config.overrides };
          if (value === 'auto') delete overrides[proposal.key];
          else overrides[proposal.key] = { kind: value as typeof naturalTransitionKinds[number], durationMs: override?.durationMs ?? config.durationMs };
          onChange({ ...config, overrides });
        }}>
          <SelectTrigger aria-label="Boundary transition type" className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Automatic</SelectItem>
            {naturalTransitionKinds.map(kind => <SelectItem value={kind} key={kind}>{naturalTransitionNames[kind]}</SelectItem>)}
          </SelectContent>
        </Select>
        {override && (override.kind === 'fade' || override.kind === 'crossfade') && <label>Boundary blend (ms)
          <input type="number" min={67} max={600} key={proposal.key + override.durationMs} defaultValue={override.durationMs} className="ml-1 w-20 rounded bg-zinc-950 p-1"
            onBlur={event => {
              const durationMs = blendDuration(event.currentTarget, override.durationMs);
              onChange({ ...config, overrides: { ...config.overrides, [proposal.key]: { ...override, durationMs } } });
            }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>}
        <Button type="button" variant="secondary" size="sm" onClick={() => onPreview(position)}>Preview transition</Button>
      </div>
    </>}
    {!proposal && <p className="text-xs text-zinc-400">Select at least two clips to review a boundary.</p>}
  </details>;
}
