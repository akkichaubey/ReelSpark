'use client';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STORY_FPS, peakForRatio, storyClasses, storyProfiles, type StoryOverride, type planStory } from '@/lib/auto-cut/story-ramp';

export function AutoCutStoryReview({ plan, overrides, busy, onOverride, onPreview, onOpen, onCancel }: {
  plan: ReturnType<typeof planStory>; overrides: Record<string, StoryOverride>; busy: boolean;
  onOverride: (key: string, override: StoryOverride) => void; onPreview: () => void; onOpen: () => void; onCancel: () => void;
}) {
  const seconds = (frames: number) => (frames / STORY_FPS).toFixed(2);
  const included = plan.rows.filter(row => row.included);
  return <details className="space-y-2 rounded-xl border border-zinc-800 p-3 text-xs">
    <summary className="cursor-pointer font-semibold">Story preservation & speed ramps</summary>
    <p>{included.length} scenes · {seconds(plan.outputFrames)} s planned · {seconds(plan.targetFrames)} s target</p>
    {!!plan.rows.filter(row => row.uncertain).length && <p className="text-amber-300">Some scenes lack semantic evidence. Review their classifications before exporting.</p>}
    {plan.outputFrames > plan.targetFrames && <p role="status" className="text-amber-300">
      Essential footage needs {seconds(plan.minimumFrames)} s at safe speeds. Increase the target or explicitly reclassify a scene to approve a cut.
    </p>}
    {plan.outputFrames < plan.targetFrames && <p role="status">Available footage falls short of the target. The draft ends at its natural length.</p>}
    {plan.overlaps && <p role="alert">Overlapping source ranges need review before a story draft can be built.</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" disabled={busy || !included.length || plan.overlaps} onClick={onPreview}>Preview story draft</Button>
      <Button type="button" size="sm" variant="secondary" disabled={busy || !included.length || plan.overlaps || plan.outputFrames > plan.targetFrames}
        onClick={onOpen}>Open story draft in Reel Maker</Button>
      {busy && <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel preparation</Button>}
    </div>
    <ol className="max-h-80 space-y-2 overflow-auto">
      {plan.rows.map(row => <li key={row.key} className="space-y-1 rounded border border-zinc-800 p-2">
        <p>{(row.clip.startMs / 1000).toFixed(2)}–{(row.clip.endMs / 1000).toFixed(2)} s · {row.clip.category}</p>
        <p className="text-zinc-400">{row.clip.reason}</p>
        <p>{row.included ? row.outputFrames < row.frames ?
          seconds(row.outputFrames) + ' s · peak ' + peakForRatio(row.outputFrames / STORY_FPS / ((row.clip.endMs - row.clip.startMs) / 1000), row.cap).toFixed(2) + '×' :
          seconds(row.outputFrames) + ' s · 1×' : 'Excluded from this draft'}{row.uncertain ? ' · Review classification' : ''}</p>
        <div className="flex flex-wrap gap-2">
          <Select value={row.importance} disabled={busy || row.clip.locked || row.clip.speechProtected || row.clip.recipeImportance === 'required'}
            onValueChange={value => onOverride(row.key, { ...overrides[row.key], importance: value as StoryOverride['importance'] })}>
            <SelectTrigger aria-label="Story classification" className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{storyClasses.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={overrides[row.key]?.profile ?? 'automatic'} disabled={busy || row.clip.locked}
            onValueChange={value => onOverride(row.key, { ...overrides[row.key], profile: value as StoryOverride['profile'] })}>
            <SelectTrigger aria-label="Speed profile" className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{storyProfiles.map(value => <SelectItem key={value} value={value}>{value === 'normal' ? 'Lock at 1×' : value}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </li>)}
    </ol>
  </details>;
}
