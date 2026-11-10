'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { brollOpportunity, brollTargetKey, BRollEditSchema, suggestBRoll, type BRollEdit } from '@/lib/auto-cut/broll';
import type { AutoCutClipCandidate } from '@/lib/auto-cut/types';
import type { MediaAsset } from '@/lib/clipping-studio/contracts';

const seconds = (ms: number) => (ms / 1000).toFixed(2);
const modeNames = { replace: 'Replace Main Visual', overlay: 'Overlay B-Roll', insert: 'Insert Cutaway' };

export function AutoCutBRollReview({ targets, footage, library, authorized, edits, ignored, projectId, busy, error,
  onOpen, onAnalyze, onSearchProject, onChange, onIgnore, onPreview }: {
  targets: AutoCutClipCandidate[]; footage: AutoCutClipCandidate[]; library: MediaAsset[];
  authorized: Record<string, string>; edits: BRollEdit[]; ignored: string[]; projectId: string; busy: boolean; error: string;
  onOpen: () => void; onAnalyze: (asset: MediaAsset) => void; onChange: (edits: BRollEdit[]) => void;
  onSearchProject: () => void;
  onIgnore: (key: string) => void; onPreview: () => void;
}) {
  const [targetKey, setTargetKey] = useState('');
  const [query, setQuery] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [start, setStart] = useState('0');
  const [length, setLength] = useState('1.8');
  const [offset, setOffset] = useState('0');
  const [mode, setMode] = useState<BRollEdit['mode']>('overlay');
  const [message, setMessage] = useState('');
  const [sourcePreview, setSourcePreview] = useState(false);
  const ranked = [...targets].sort((a, b) => brollOpportunity(b).rank - brollOpportunity(a).rank);
  const target = ranked.find(clip => brollTargetKey(clip) === targetKey) ?? ranked[0];
  const key = target ? brollTargetKey(target) : '';
  const source = library.find(item => item.id === sourceId);
  const approved = library.filter(item => Object.hasOwn(authorized, item.id));
  const matchedSources = approved.filter(item => item.filename.toLowerCase().includes(query.trim().toLowerCase()) ||
    footage.some(clip => clip.sourceVideoId === item.id && [clip.category, ...(clip.actionTags ?? []), ...(clip.objects ?? [])]
      .some(term => term.toLowerCase().includes(query.trim().toLowerCase()))));
  const suggestions = target && !ignored.includes(key) ? suggestBRoll(target, footage, approved, targets,
    edits.filter(edit => edit.targetId !== target.id), projectId) : [];
  const current = edits.find(edit => edit.targetId === target?.id);
  const select = (id: string, startMs: number, durationMs: number, offsetMs = 0, action: BRollEdit['mode'] = 'overlay') => {
    setSourceId(id); setStart(String(startMs / 1000)); setLength(String(durationMs / 1000)); setOffset(String(offsetMs / 1000));
    setMode(action); setMessage(''); setSourcePreview(false);
  };
  const loadTarget = (next: string) => {
    setTargetKey(next);
    const nextTarget = targets.find(clip => brollTargetKey(clip) === next);
    const edit = edits.find(item => item.targetId === nextTarget?.id);
    if (edit) select(edit.sourceId, edit.startMs, edit.durationMs, edit.offsetMs, edit.mode);
    else select('', 0, 1800);
  };
  return <details className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
    onToggle={event => { if (event.currentTarget.open) onOpen(); }}>
    <summary className="cursor-pointer text-sm font-semibold text-white">B-roll suggestions · {edits.length} placed</summary>
    <p className="text-xs text-zinc-400">Suggestions use footage you can access. Overlays and visual replacements keep narration in place. Inserted cutaways add time before the target.</p>
    {busy && <p role="status" className="text-xs text-zinc-400">Checking footage and analyzing selected sources…</p>}
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onSearchProject}>Search project footage</Button>
    {target && <>
      <label className="block text-xs">Narrative segment
        <select aria-label="B-roll target" className="ml-2 max-w-full rounded bg-zinc-950 p-1" value={key}
          onChange={event => loadTarget(event.target.value)}>
          {ranked.map(clip => <option key={brollTargetKey(clip)} value={brollTargetKey(clip)}>
            {seconds(clip.startMs)}–{seconds(clip.endMs)} s · {clip.category}
          </option>)}
        </select>
      </label>
      <p className="text-xs text-zinc-400">{brollOpportunity(target).reason}</p>
      <div className="space-y-1 text-xs">
        {ignored.includes(key) ? <p>Suggestions ignored for this segment.</p> :
          !suggestions.length && !busy ? <p className="text-amber-300">Missing Shot · No matching visual evidence was found for {target.category}.</p> : null}
        {suggestions.map(suggestion => <div key={suggestion.clip.id} className="rounded border border-zinc-800 p-2">
          <p className="font-semibold">{suggestion.source.filename} · {seconds(suggestion.startMs)}–{seconds(suggestion.clip.endMs)} s · {suggestion.score}/100 relevance</p>
          <p className="text-zinc-400">{suggestion.reason}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => {
            const duration = Math.min(1800, target.durationMs, suggestion.clip.endMs - suggestion.startMs);
            const spoken = target.transcriptWords?.find(word => word.startMs >= target.startMs && word.endMs <= target.endMs);
            select(suggestion.source.id, suggestion.startMs, duration,
              Math.max(0, Math.min(target.durationMs - duration, (spoken?.startMs ?? target.startMs) - target.startMs)), target.locked ? 'insert' : 'overlay');
          }}>Use suggestion</Button>
        </div>)}
        <Button type="button" variant="ghost" size="sm" onClick={() => onIgnore(key)}>{ignored.includes(key) ? 'Restore suggestions' : 'Ignore'}</Button>
      </div>
      <form className="space-y-2 border-t border-zinc-800 pt-3 text-xs" onSubmit={event => {
        event.preventDefault();
        if (!source || !authorized[source.id] || !target.sourceVideoId) return;
        const parsed = BRollEditSchema.safeParse({ targetId: target.id, targetSourceId: target.sourceVideoId, targetStartMs: target.startMs,
          sourceId, startMs: Math.round(Number(start) * 1000), durationMs: Math.round(Number(length) * 1000),
          offsetMs: mode === 'insert' ? 0 : Math.round(Number(offset) * 1000), mode });
        if (!parsed.success || parsed.data.startMs + parsed.data.durationMs > source.metadata.durationMs ||
            (mode !== 'insert' && (target.locked || parsed.data.offsetMs + parsed.data.durationMs > target.durationMs))) {
          setMessage('Check the source and target ranges. Use 0.25–15 seconds within the source, and keep timed overlays or replacements inside an unlocked target.');
          return;
        }
        const next = parsed.data;
        if (edits.some(edit => edit.targetId !== target.id && edit.sourceId === sourceId &&
          edit.startMs < next.startMs + next.durationMs && next.startMs < edit.startMs + edit.durationMs)) {
          setMessage('That source range is already used by another B-roll placement. Choose another range.');
          return;
        }
        onChange([...edits.filter(edit => edit.targetId !== target.id), next]);
        setMessage('');
      }}>
        <label className="block">Search authorized footage <input value={query} onChange={event => setQuery(event.target.value)}
          className="ml-2 rounded border border-zinc-700 bg-zinc-950 p-1" /></label>
        <label className="block">B-roll source <select aria-label="B-roll source" value={sourceId}
          onChange={event => select(event.target.value, 0, Math.min(1800, target.durationMs, library.find(item => item.id === event.target.value)?.metadata.durationMs ?? 1800))}
          className="ml-2 max-w-full rounded bg-zinc-950 p-1">
          <option value="">Choose authorized footage</option>
          {[...new Map([...matchedSources, ...(source && authorized[source.id] ? [source] : [])].map(item => [item.id, item])).values()]
            .map(item => <option key={item.id} value={item.id}>{item.filename}{item.projectId === projectId ? ' · Project' : ' · Library'}</option>)}
        </select></label>
        <div className="flex flex-wrap gap-2">
          <label>Source in (s) <input type="number" required min={0} step={0.01} value={start} onChange={event => setStart(event.target.value)} className="w-20 rounded bg-zinc-950 p-1" /></label>
          <label>Duration (s) <input type="number" required min={0.25} max={15} step={0.01} value={length} onChange={event => setLength(event.target.value)} className="w-20 rounded bg-zinc-950 p-1" /></label>
          {mode !== 'insert' && <label>Target offset (s) <input type="number" required min={0} step={0.01} value={offset}
            onChange={event => setOffset(event.target.value)} className="w-20 rounded bg-zinc-950 p-1" /></label>}
          <label>Action <select aria-label="B-roll action" value={mode} onChange={event => setMode(event.target.value as BRollEdit['mode'])}
            className="rounded bg-zinc-950 p-1">
            {Object.entries(modeNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select></label>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button type="submit" size="sm" disabled={!sourceId || !authorized[sourceId] || busy}>{current ? 'Update placement' : 'Place B-roll'}</Button>
          {source && authorized[source.id] && <>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSourcePreview(value => !value)}>{sourcePreview ? 'Close source preview' : 'Preview source range'}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onAnalyze(source)}>Analyze source for suggestions</Button>
          </>}
          {current && <Button type="button" size="sm" variant="ghost" onClick={() => select(current.sourceId, current.startMs, current.durationMs, current.offsetMs, current.mode)}>Edit placed range</Button>}
        </div>
        {sourcePreview && source && authorized[source.id] && <video key={source.id + ':' + start + ':' + length}
          aria-label="B-roll source preview" controls controlsList="nodownload" muted playsInline preload="metadata"
          className="max-h-48 w-full bg-black" src={authorized[source.id] + '#t=' + Number(start) + ',' + (Number(start) + Number(length))} />}
        {message && <p role="alert" className="text-red-300">{message}</p>}
      </form>
    </>}
    {edits.length > 0 && <div className="space-y-1 border-t border-zinc-800 pt-2 text-xs">
      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onPreview}>Preview B-roll draft</Button>
      {edits.map(edit => <div key={edit.targetId} className="flex flex-wrap items-center gap-2">
        <span>{modeNames[edit.mode]} · {library.find(item => item.id === edit.sourceId)?.filename ?? 'Unavailable source'} · {seconds(edit.startMs)}–{seconds(edit.startMs + edit.durationMs)} s</span>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onChange(edits.filter(item => item !== edit))}>Remove B-roll</Button>
      </div>)}
    </div>}
  </details>;
}
