'use client';
import type { TimelineClip } from '@/lib/timeline/model';

/** Native range handles retain touch and keyboard support inside tiny clips. */
export function AudioClipControls({ clip, disabled, onBegin, onEdit, onEnd, onCancel }: {
  clip: TimelineClip; disabled: boolean; onBegin: () => void;
  onEdit: (patch: Partial<TimelineClip>) => void; onEnd: () => void; onCancel: () => void;
}) {
  const controls = [
    { name: 'Volume', max: 200, value: Math.round(clip.volume * 100), change: (value: number) => ({ volume: value / 100 }) },
    { name: 'Audio fade in', max: clip.durationMs - (clip.audioFadeOutMs ?? clip.fadeOutMs), value: clip.audioFadeInMs ?? clip.fadeInMs, change: (value: number) => ({ audioFadeInMs: value }) },
    { name: 'Audio fade out', max: clip.durationMs - (clip.audioFadeInMs ?? clip.fadeInMs), value: clip.audioFadeOutMs ?? clip.fadeOutMs, change: (value: number) => ({ audioFadeOutMs: value }) },
  ];
  return <div className="absolute bottom-0.5 left-2 right-2 z-20 flex gap-1 rounded bg-zinc-950/80 px-1" onDoubleClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
    {controls.map(control => <input key={control.name} type="range" aria-label={`${control.name}: ${clip.name}`}
      title={`${control.name}: ${control.name === 'Volume' ? `${control.value}%` : `${(control.value / 1000).toFixed(2)}s`}`}
      disabled={disabled} min={0} max={Math.max(0, control.max)} step={1} value={control.value}
      className="h-6 min-w-0 flex-1 touch-none accent-amber-400" onClick={e => e.stopPropagation()}
      onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); onBegin(); }}
      onPointerUp={e => { e.stopPropagation(); onEnd(); }}
      onPointerCancel={onCancel}
      onLostPointerCapture={onCancel}
      onKeyDown={e => e.stopPropagation()}
      onChange={e => onEdit(control.change(Number(e.target.value)))} />)}
  </div>;
}
