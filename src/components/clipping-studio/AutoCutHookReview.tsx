'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { trimHook, type AutoCutHook } from '@/lib/auto-cut/hooks';

export function AutoCutHookReview({ options, selected, duration, onDuration, onSelect, onPreview }: {
  options: AutoCutHook[];
  selected: AutoCutHook | undefined;
  duration: number;
  onDuration: (duration: number) => void;
  onSelect: (hook: AutoCutHook | undefined) => void;
  onPreview: (hook: AutoCutHook) => void;
}) {
  const [error, setError] = useState('');
  const preview = (hook: AutoCutHook) => {
    try { onPreview(hook); setError(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to preview this hook.'); }
  };
  return (
    <details className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-white">
        Opening hook · {selected?.style ?? 'Off'}
      </summary>
      <label className="block text-xs text-zinc-300">Suggested duration (seconds)
        <input type="number" min={1} max={3} step={0.5} value={duration / 1000}
          onChange={event => {
            const seconds = event.currentTarget.valueAsNumber;
            if (seconds >= 1 && seconds <= 3) onDuration(Math.round(seconds * 1000));
          }} className="ml-2 w-16 rounded border border-zinc-700 bg-zinc-950 p-1" />
      </label>
      {!options.length && <p className="text-xs text-zinc-400">There are no supported hook suggestions for this footage.</p>}
      <ul className="space-y-2">
        {options.map(option => (
          <li key={option.clip.id} className="space-y-1 rounded border border-zinc-800 p-2 text-xs">
            <p className="font-medium">{option.style} · {(option.clip.startMs / 1000).toFixed(2)}–{(option.clip.endMs / 1000).toFixed(2)} s</p>
            <p className="text-zinc-400">{option.clip.reason}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => preview(option)}>Preview</Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => { setError(''); onSelect(option); }}>Use hook</Button>
          </li>
        ))}
      </ul>
      {selected && <form key={`${selected.clip.id}:${selected.clip.startMs}:${selected.clip.endMs}`} className="space-y-2 border-t border-zinc-800 pt-2 text-xs"
        onSubmit={event => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          try {
            const audio = fields.get('audio') as AutoCutHook['audio'];
            const next = trimHook({ ...selected, audio, text: String(fields.get('text')).trim(), replay: fields.has('replay') },
              Math.round(Number(fields.get('start')) * 1000), Math.round(Number(fields.get('end')) * 1000));
            onSelect(next);
            setError('');
          } catch (err) { setError(err instanceof Error ? err.message : 'Invalid hook.'); }
        }}>
        <div className="flex flex-wrap gap-2">
          <label>Source in (s) <input className="w-20 rounded bg-zinc-950 p-1" required name="start" type="number" min={0} step={0.001} defaultValue={selected.clip.startMs / 1000} /></label>
          <label>Source out (s) <input className="w-20 rounded bg-zinc-950 p-1" required name="end" type="number" min={0} step={0.001} defaultValue={selected.clip.endMs / 1000} /></label>
          <label>Audio <select aria-label="Hook audio" name="audio" defaultValue={selected.audio} className="rounded bg-zinc-950 p-1">
            <option value="source">Original source audio</option>
            <option value="voice">Recorded source speech</option>
            <option value="visual">Visual only</option>
          </select></label>
        </div>
        <label className="block">Optional overlay <input name="text" defaultValue={selected.text} maxLength={80}
          className="ml-2 rounded border border-zinc-700 bg-zinc-950 p-1" /></label>
        <label className="block"><input name="replay" type="checkbox" defaultChecked={selected.replay} /> Allow intentional replay in the body</label>
        <Button type="submit" size="sm">Save hook edits</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => preview(selected)}>Preview selected</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setError(''); onSelect(undefined); }}>Disable hook</Button>
      </form>}
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </details>
  );
}
