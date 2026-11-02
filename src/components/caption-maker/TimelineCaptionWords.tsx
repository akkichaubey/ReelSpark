'use client';
import { useMemo, useRef, useState } from 'react';
import type { CaptionGroup } from '@/lib/caption-maker/types';
import type { TimelineClip } from '@/lib/timeline/model';
import { getActiveTranscriptWordAtTime } from '@/lib/caption-maker/caption-timing';
import { editCaptionWord } from '@/lib/timeline/caption-edits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function TimelineCaptionWords({ clip, groups, pixelsPerMs, currentMs, fps, disabled, onChange, onSeek, onError, onSelect, visibleStartMs = -Infinity, visibleEndMs = Infinity }: {
  clip: TimelineClip; groups: CaptionGroup[]; pixelsPerMs: number; currentMs: number; fps: number; disabled: boolean;
  onChange: (groups: CaptionGroup[]) => void; onSeek: (time: number) => void; onError: (message: string) => void;
  onSelect?: () => void;
  visibleStartMs?: number; visibleEndMs?: number;
}) {
  const [draft, setDraft] = useState<CaptionGroup[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const textCommitted = useRef(false);
  const gesture = useRef<{ id: string; edge: 'start' | 'end'; x: number; time: number; base: CaptionGroup[]; next?: CaptionGroup[]; moved?: boolean } | null>(null);
  const bounds = { start: clip.sourceStartMs / 1000, end: (clip.sourceStartMs + clip.durationMs) / 1000 };
  const words = useMemo(() => (draft || groups).flatMap(g => g.words).filter(w => w.end > clip.sourceStartMs / 1000 && w.start < (clip.sourceStartMs + clip.durationMs) / 1000), [draft, groups, clip.sourceStartMs, clip.durationMs]);
  const visibleWords = words.filter(w => w.id === editing?.id || w.id === draggingId ||
    (clip.startMs + w.end * 1000 - clip.sourceStartMs >= visibleStartMs && clip.startMs + w.start * 1000 - clip.sourceStartMs <= visibleEndMs));
  const sourceTime = (currentMs - clip.startMs + clip.sourceStartMs) / 1000;
  const active = currentMs >= clip.startMs && currentMs < clip.startMs + clip.durationMs ? getActiveTranscriptWordAtTime(words, sourceTime)?.id : undefined;
  const saveText = () => {
    if (!editing || textCommitted.current) return;
    try { const next = editCaptionWord(groups, editing.id, { text: editing.text }, bounds, fps); textCommitted.current = true; onChange(next); setEditing(null); }
    catch (e) { textCommitted.current = false; onError(e instanceof Error ? e.message : 'Unable to edit caption'); }
  };
  return <div className="absolute inset-0" onDoubleClick={e => e.stopPropagation()}>
    {visibleWords.map(word => <div key={word.id} className={`absolute bottom-1 top-1 overflow-hidden rounded border ${active === word.id ? 'border-amber-300 bg-amber-400 text-black' : 'border-amber-500/40 bg-zinc-900 text-zinc-200'}`}
      style={{ left: (Math.max(bounds.start, word.start) - bounds.start) * 1000 * pixelsPerMs, width: Math.max(3, (Math.min(bounds.end, word.end) - Math.max(bounds.start, word.start)) * 1000 * pixelsPerMs) }}>
      {editing?.id === word.id ? <Input autoFocus aria-label="Edit caption word" value={editing.text} className="h-full w-full bg-zinc-900 px-2 text-xs text-zinc-100"
        onPointerDown={e => e.stopPropagation()} onChange={e => setEditing({ ...editing, text: e.target.value })} onBlur={saveText}
        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); saveText(); } if (e.key === 'Escape') { e.preventDefault(); textCommitted.current = true; setEditing(null); } }} />
        : <Button type="button" aria-label={`Caption: ${word.text}`} aria-current={active === word.id ? 'true' : undefined}
          title={`${word.text} · Double-click or press Enter to edit text`}
          className="h-full w-full truncate px-2 text-left text-[10px]" disabled={disabled}
          onPointerDown={e => { e.stopPropagation(); onSelect?.(); }} onClick={e => { e.stopPropagation(); onSeek((clip.startMs + Math.max(0, word.start * 1000 - clip.sourceStartMs)) / 1000); }}
          onDoubleClick={() => { textCommitted.current = false; setEditing({ id: word.id, text: word.text }); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); onSelect?.(); textCommitted.current = false; setEditing({ id: word.id, text: word.text }); } else if (e.code === 'Space') e.stopPropagation(); }}>
          {word.text}
        </Button>}
      {(['start', 'end'] as const).map(edge => <Button key={edge} type="button" role="slider" aria-label={`${edge} boundary: ${word.text}`} aria-valuenow={Math.max(bounds.start, Math.min(bounds.end, word[edge]))} aria-valuemin={bounds.start} aria-valuemax={bounds.end} aria-valuetext={`${Math.max(bounds.start, Math.min(bounds.end, word[edge])).toFixed(2)} seconds in source`}
        title={`Drag ${edge} boundary · Arrow keys: one frame`} disabled={disabled}
        className={`absolute inset-y-0 w-1.5 touch-none cursor-ew-resize bg-amber-300/30 hover:bg-amber-300 ${edge === 'start' ? 'left-0' : 'right-0'}`}
        onPointerDown={e => { e.stopPropagation(); onSelect?.(); setDraggingId(word.id); e.currentTarget.setPointerCapture(e.pointerId); gesture.current = { id: word.id, edge, x: e.clientX, time: Math.max(bounds.start, Math.min(bounds.end, word[edge])), base: groups }; }}
        onPointerMove={e => {
          e.stopPropagation(); const state = gesture.current; if (!state) return;
          if (!state.moved && Math.abs(e.clientX - state.x) < 3) return;
          state.moved = true;
          try { state.next = editCaptionWord(state.base, state.id, { [state.edge]: state.time + (e.clientX - state.x) / pixelsPerMs / 1000 }, bounds, fps); setDraft(state.next); }
          catch (error) { state.next = undefined; setDraft(null); onError(error instanceof Error ? error.message : 'Invalid word boundary'); }
        }}
        onPointerUp={e => { e.stopPropagation(); const next = gesture.current?.next; gesture.current = null; setDraggingId(null); setDraft(null); if (next) onChange(next); }}
        onPointerCancel={() => { gesture.current = null; setDraggingId(null); setDraft(null); }}
        onLostPointerCapture={() => { gesture.current = null; setDraggingId(null); setDraft(null); }}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) { if (!e.ctrlKey && !e.metaKey) e.stopPropagation(); return; } e.stopPropagation(); e.preventDefault();
          try { onChange(editCaptionWord(groups, word.id, { [edge]: Math.max(bounds.start, Math.min(bounds.end, word[edge])) + (e.key === 'ArrowRight' ? 1 : -1) / fps }, bounds, fps)); }
          catch (error) { onError(error instanceof Error ? error.message : 'Invalid boundary'); }
        }} />)}
    </div>)}
  </div>;
}
