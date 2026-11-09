'use client';

import { Button } from '@/components/ui/button';
import { CookingActivitySchema, type AutoCutClipCandidate, type CookingActivity } from '@/lib/auto-cut/types';

export function AutoCutRecipeReview({ steps, sourceNames, notice, onChange, onApply, onPreview }: {
  steps: AutoCutClipCandidate[];
  sourceNames: Record<string, string>;
  notice: string;
  onChange: (steps: AutoCutClipCandidate[]) => void;
  onApply: () => void;
  onPreview: (step: AutoCutClipCandidate) => void;
}) {
  const ordered = [...steps].sort((a, b) => (a.recipeOrder ?? 0) - (b.recipeOrder ?? 0));
  const change = (index: number, patch: Partial<AutoCutClipCandidate>) =>
    onChange(ordered.map((step, position) => position === index ? { ...step, ...patch } : step));
  const move = (index: number, direction: -1 | 1) => {
    const next = [...ordered];
    const destination = index + direction;
    [next[index], next[destination]] = [next[destination], next[index]];
    onChange(next.map((step, recipeOrder) => ({ ...step, recipeOrder })));
  };
  const field = 'rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200';
  return (
    <details open className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-white">Recipe steps · {ordered.length}</summary>
      <p className="text-xs text-zinc-400">Review the source evidence and set the order and priority for the next draft.</p>
      {notice && <p role="status" className="text-xs text-amber-300">{notice}</p>}
      <Button type="button" variant="secondary" size="sm" onClick={onApply}>Apply recipe steps</Button>
      <ol className="max-h-[36rem] space-y-3 overflow-y-auto">
        {ordered.map((step, index) => (
          <li key={step.id} className="space-y-2 rounded-lg border border-zinc-800 p-3">
            <div className="flex items-center gap-2">
              {step.thumbnailBase64 && (
                // The analysis route supplies a small, pre-scaled data URL.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={step.thumbnailBase64} alt="" className="h-12 w-16 rounded object-cover" />
              )}
              <span className="text-xs text-zinc-300">
                Step {index + 1} · {step.sourceVideoId && sourceNames[step.sourceVideoId]} · {(step.startMs / 1000).toFixed(2)}–{(step.endMs / 1000).toFixed(2)} s · {step.confidence ? `${step.confidence}% AI confidence` : 'Unverified'}
              </span>
              <Button type="button" size="sm" variant="ghost" onClick={() => onPreview(step)}>Preview</Button>
            </div>
            <input aria-label={`Step ${index + 1} action label`} className={`w-full ${field}`} value={step.category} maxLength={160}
              onChange={event => change(index, { category: event.target.value, recipeLabelEdited: true })} />
            <div className="flex flex-wrap items-center gap-1">
              <select aria-label={`Step ${index + 1} stage`} className={field} value={step.cookingActivity ?? ''}
                onChange={event => change(index, { cookingActivity: event.target.value as CookingActivity || undefined, recipeLabelEdited: true })}>
                <option value="">Unverified stage</option>
                {CookingActivitySchema.options.map(stage => <option key={stage} value={stage}>{stage.replaceAll('_', ' ')}</option>)}
              </select>
              <select aria-label={`Step ${index + 1} priority`} className={field} value={step.recipeImportance ?? ''}
                onChange={event => change(index, { recipeImportance: event.target.value as AutoCutClipCandidate['recipeImportance'] || undefined })}>
                <option value="">{step.recipeEvidence?.essential ? 'AI suggests required' : 'Automatic priority'}</option>
                <option value="required">Required</option><option value="optional">Optional</option><option value="excluded">Excluded</option>
              </select>
              <Button type="button" variant="ghost" size="sm" disabled={!index} onClick={() => move(index, -1)} aria-label={`Move step ${index + 1} earlier`}>↑</Button>
              <Button type="button" variant="ghost" size="sm" disabled={index === ordered.length - 1} onClick={() => move(index, 1)} aria-label={`Move step ${index + 1} later`}>↓</Button>
            </div>
            <details className="text-xs text-zinc-400">
              <summary className="cursor-pointer">Evidence</summary>
              <p>{step.reason}</p>
              {step.recipeEvidence && <p>
                {[step.recipeEvidence.footage.replaceAll('_', ' '), ...step.recipeEvidence.ingredients,
                  ...step.recipeEvidence.utensils, ...step.recipeEvidence.techniques].join(' · ')}
              </p>}
              {!!step.transcriptWords?.length && <p>Speech · {step.transcriptWords.map(word => word.text).join(' ')}</p>}
              {!!step.evidenceFrames?.length && <p>Frames · {step.evidenceFrames.map(time => (time / 1000).toFixed(2) + ' s').join(', ')}</p>}
            </details>
          </li>
        ))}
      </ol>
    </details>
  );
}
