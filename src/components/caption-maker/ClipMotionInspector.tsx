'use client';
import { useRef, useState } from 'react';
import type { TimelineClip } from '@/lib/timeline/model';
import { animationTime, applyMotionPreset, motionProperties, motionPresets, motionValue, putMotionKeyframe, MAX_MOTION_TIME_MS, type ClipMotion, type MotionProperty, type MotionEasing } from '@/lib/timeline/motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function MotionNumberField({ value, min, max, step, onCommit }: { value: number; min: number; max: number; step: number | 'any'; onCommit: (value: number) => boolean }) {
  const [draft, setDraft] = useState(String(value));
  return <Input type="number" min={min} max={max} step={step} required value={draft} className="w-24 rounded border border-zinc-700 bg-zinc-900 p-1"
    onChange={e => { e.currentTarget.setCustomValidity(''); setDraft(e.target.value); }}
    onBlur={e => {
      const number = Number(draft);
      if (!draft.trim() || !Number.isFinite(number) || number < min || number > max || !onCommit(number)) {
        e.currentTarget.setCustomValidity(`Enter a valid value between ${min} and ${max}.`); e.currentTarget.reportValidity();
      }
    }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />;
}

function CurveEditor({ value, onChange }: { value: [number, number, number, number]; onChange: (value: [number, number, number, number]) => void }) {
  const dragging = useRef<number | null>(null);
  const update = (index: number, x: number, y: number) => {
    const next = [...value] as typeof value; next[index * 2] = Math.max(0, Math.min(1, x)); next[index * 2 + 1] = Math.max(0, Math.min(1, y)); onChange(next);
  };
  return <div className="flex items-start gap-3">
    <svg viewBox="-6 -6 112 112" className="h-32 w-32 shrink-0 touch-none rounded border border-zinc-700 bg-zinc-950" aria-label="Cubic Bezier easing curve">
      <path d="M0 100 L100 100 L100 0" fill="none" stroke="#71717a" />
      <path d={`M0 100 C${value[0] * 100} ${100 - value[1] * 100}, ${value[2] * 100} ${100 - value[3] * 100}, 100 0`} fill="none" stroke="#fbbf24" strokeWidth={2} />
      <path d={`M0 100 L${value[0] * 100} ${100 - value[1] * 100} M100 0 L${value[2] * 100} ${100 - value[3] * 100}`} stroke="#71717a" />
      {[0, 1].map(index => <circle key={index} cx={value[index * 2] * 100} cy={100 - value[index * 2 + 1] * 100} r={4} fill="#fbbf24" role="button" tabIndex={0}
        aria-label={`Curve handle ${index + 1}, x ${value[index * 2].toFixed(2)}, y ${value[index * 2 + 1].toFixed(2)}. Use arrow keys to adjust.`}
        onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); dragging.current = index; }}
        onPointerMove={e => { if (dragging.current !== index) return; const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect(); update(index, ((e.clientX - rect.left) / rect.width * 112 - 6) / 100, 1 - ((e.clientY - rect.top) / rect.height * 112 - 6) / 100); }}
        onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }} onLostPointerCapture={() => { dragging.current = null; }}
        onKeyDown={e => { e.stopPropagation(); if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return; e.preventDefault(); update(index, value[index * 2] + (e.key === 'ArrowLeft' ? -0.01 : e.key === 'ArrowRight' ? 0.01 : 0), value[index * 2 + 1] + (e.key === 'ArrowDown' ? -0.01 : e.key === 'ArrowUp' ? 0.01 : 0)); }} />)}
    </svg>
    <div className="grid flex-1 grid-cols-2 gap-2">{value.map((number, i) => <label key={i} className="text-xs">{['X1', 'Y1', 'X2', 'Y2'][i]}
      <Input type="number" min={0} max={1} step={0.01} value={Number(number.toFixed(3))} className="w-full rounded border border-zinc-700 bg-zinc-900 p-1"
        onChange={e => { const next = [...value] as typeof value; next[i] = Math.max(0, Math.min(1, Number(e.target.value))); onChange(next); }} />
    </label>)}</div>
  </div>;
}

export function ClipMotionInspector({ clip, currentMs, clipboard, onCopy, onChange }: {
  clip: TimelineClip; currentMs: number; clipboard: ClipMotion | null; onCopy: (motion: ClipMotion) => void; onChange: (clip: TimelineClip) => void;
}) {
  const [property, setProperty] = useState<MotionProperty>('x');
  const [preset, setPreset] = useState<typeof motionPresets[number]>('Zoom in');
  const [error, setError] = useState('');
  const keys = clip.motion?.channels[property] || [], spec = motionProperties[property];
  const inside = currentMs >= clip.startMs && currentMs < clip.startMs + clip.durationMs;
  const raw = currentMs - clip.startMs + (clip.motion?.offsetMs || 0);
  const time = Math.max(0, Math.round(property === 'speed' ? raw : animationTime(clip.motion, currentMs - clip.startMs)));
  const save = (motion: ClipMotion) => { onChange({ ...clip, motion }); setError(''); };
  const update = (index: number, patch: Partial<(typeof keys)[number]>) => {
    try {
      const motion = { ...clip.motion, channels: { ...clip.motion?.channels, [property]: keys.filter((_, i) => i !== index) } };
      save(putMotionKeyframe(motion, property, { ...keys[index], ...patch })); return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Invalid keyframe'); return false; }
  };
  return <fieldset className="space-y-3 rounded-lg border border-zinc-700 p-3">
    <legend className="px-1 font-semibold">Clip keyframe animation</legend>
    <p className="text-xs text-zinc-400">Animation speed changes motion progress; video, audio and caption playback stay at their original rate. Apply saves these edits.</p>
    <div className="flex flex-wrap gap-2">
      <Select value={property} onValueChange={value => setProperty(value as MotionProperty)}><SelectTrigger aria-label="Animation property"><SelectValue /></SelectTrigger>
        <SelectContent>{Object.entries(motionProperties).map(([name, item]) => <SelectItem key={name} value={name}>{item.label}</SelectItem>)}</SelectContent>
      </Select>
      <Button type="button" variant="outline" size="sm" disabled={!inside || keys.length >= 200} onClick={() => {
        try { save(putMotionKeyframe(clip.motion, property, { timeMs: time, value: motionValue(keys, time, spec.initial), easing: 'linear' })); }
        catch (e) { setError(e instanceof Error ? e.message : 'Invalid keyframe'); }
      }}>Add at playhead</Button>
      <Button type="button" variant="ghost" size="sm" disabled={!clip.motion} onClick={() => onCopy(structuredClone(clip.motion!))}>Copy keyframes</Button>
      <Button type="button" variant="ghost" size="sm" disabled={!clipboard} onClick={() => save(structuredClone(clipboard!))}>Paste keyframes</Button>
      <Button type="button" variant="ghost" size="sm" disabled={!clip.motion} onClick={() => onChange({ ...clip, motion: undefined })}>Clear motion</Button>
    </div>
    <svg viewBox="0 0 200 44" preserveAspectRatio="none" className="h-14 w-full rounded bg-zinc-950" role="img" aria-label={`${spec.label} animation graph`}>
      <polyline fill="none" stroke="#fbbf24" strokeWidth={1} points={Array.from({ length: 81 }, (_, i) => {
        const t = i / 80 * Math.max(1, keys[keys.length - 1]?.timeMs || clip.durationMs);
        return `${i * 2.5},${42 - (motionValue(keys, t, spec.initial) - spec.min) / (spec.max - spec.min) * 40}`;
      }).join(' ')} />
    </svg>
    <div className="max-h-64 space-y-3 overflow-auto">{keys.map((key, index) => <div key={`${property}_${index}`} className="space-y-2 rounded border border-zinc-700 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">Curve time (s)<MotionNumberField key={`time_${key.timeMs}`} min={0} max={MAX_MOTION_TIME_MS / 1000} step={0.001} value={key.timeMs / 1000} onCommit={value => update(index, { timeMs: Math.round(value * 1000) })} /></label>
        <label className="text-xs">{spec.label}<MotionNumberField key={`value_${key.value}`} min={spec.min} max={spec.max} step="any" value={key.value} onCommit={value => update(index, { value })} /></label>
        <Select value={key.easing} onValueChange={value => update(index, { easing: value as MotionEasing, bezier: value === 'bezier' ? key.bezier || [0.25, 0.1, 0.25, 1] : undefined })}>
          <SelectTrigger aria-label={`Easing after keyframe ${index + 1}`}><SelectValue /></SelectTrigger><SelectContent>{['linear', 'ease-in', 'ease-out', 'ease-in-out', 'bezier'].map(easing => <SelectItem key={easing} value={easing}>{easing}</SelectItem>)}</SelectContent>
        </Select>
        <Button type="button" variant="ghost" size="sm" aria-label={`Delete animation keyframe ${index + 1}`} onClick={() => save({ ...clip.motion, channels: { ...clip.motion?.channels, [property]: keys.filter((_, i) => i !== index) } })}>Delete</Button>
      </div>
      {key.easing === 'bezier' && key.bezier && <CurveEditor value={key.bezier} onChange={bezier => update(index, { bezier })} />}
    </div>)}</div>
    <div className="flex flex-wrap items-center gap-2"><Select value={preset} onValueChange={value => setPreset(value as typeof preset)}><SelectTrigger aria-label="Motion preset"><SelectValue /></SelectTrigger><SelectContent>{motionPresets.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select>
      <Button type="button" variant="outline" size="sm" title="Replaces this clip's existing motion keyframes" onClick={() => save(applyMotionPreset(preset, clip.durationMs))}>Apply motion preset</Button>
    </div>
    {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
  </fieldset>;
}
