'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { speechClip, type SpeechMoment } from '@/lib/auto-cut/speech';
import type { AutoCutClipCandidate } from '@/lib/auto-cut/types';

export function AutoCutSpeechReview({ moments, onSeek, onEdit, onAdd, onApply }: {
  moments: SpeechMoment[];
  onSeek: (moment: SpeechMoment, timeMs: number) => void;
  onEdit: (moment: SpeechMoment, index: number, text: string) => void;
  onAdd: (clip: AutoCutClipCandidate) => void;
  onApply: () => void;
}) {
  const [error, setError] = useState('');
  return (
    <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-white">Speech &amp; highlights · {moments.length}</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-zinc-400">Review original-language speech. Timings come from the speech provider. Speaker identities are unknown.</p>
        {!moments.length && <p className="text-xs text-zinc-400">No timed speech is available. You can still review the video and build a draft from scenes.</p>}
        <Button type="button" variant="secondary" size="sm" disabled={!moments.some(moment => moment.complete)}
          onClick={onApply}>Build draft from speech highlights</Button>
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        <ol className="max-h-[32rem] space-y-2 overflow-y-auto">
          {moments.map(moment => (
            <li key={moment.id} className="space-y-2 rounded-lg border border-zinc-800 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                <Button type="button" variant="ghost" size="sm" onClick={() => onSeek(moment, moment.startMs)}>
                  {(moment.startMs / 1000).toFixed(2)}–{(moment.endMs / 1000).toFixed(2)} s
                </Button>
                <span className="text-amber-300">{moment.kind === 'none' ? 'Speech' : moment.kind} · {moment.score}/100</span>
                <span>{moment.language} · {moment.complete ? 'Sentence ending detected' : 'Review incomplete phrase'}</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                {moment.timing === 'provider_segment' ? 'Segment timings' : 'Estimated word timings'}
                {moment.repeat ? ' · Possible repeated take' : ''}
                {moment.fillerCount ? ` · ${moment.fillerCount} possible fillers` : ''}
                {moment.signal === 'quiet_signal' ? ' · Low audio level' : moment.signal === 'clipped_signal' ? ' · Possible clipping' : ''}
              </p>
              <p className="text-xs text-white">{moment.words.map(word => word.text).join(' ')}</p>
              {moment.context.visionProvider && <p className="text-[11px] text-zinc-400">Visual context · {moment.context.category}</p>}
              <details>
                <summary className="cursor-pointer text-xs text-amber-300">Edit timed transcript</summary>
                <div className="mt-2 space-y-1">
                  {moment.words.map((word, index) => (
                    <div key={`${word.startMs}:${index}`} className="flex gap-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => onSeek(moment, word.startMs)}>
                        {(word.startMs / 1000).toFixed(2)} s
                      </Button>
                      <input aria-label={`Transcript text at ${word.startMs} milliseconds`} defaultValue={word.text} maxLength={500}
                        className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-white"
                        onBlur={event => {
                          const text = event.currentTarget.value.trim();
                          if (text && text !== word.text) onEdit(moment, index, text);
                          if (!text) event.currentTarget.value = word.text;
                        }} />
                    </div>
                  ))}
                </div>
              </details>
              <form className="flex flex-wrap items-center gap-2 text-xs text-zinc-300" onSubmit={event => {
                event.preventDefault();
                const values = new FormData(event.currentTarget);
                try {
                  onAdd(speechClip(moment, Math.round(Number(values.get('start')) * 1000), Math.round(Number(values.get('end')) * 1000)));
                  setError('');
                } catch (failure) {
                  setError(failure instanceof Error ? failure.message : 'Invalid speech range.');
                }
              }}>
                <label>Start (s) <input name="start" type="number" step="0.001" required min={moment.startMs / 1000}
                  max={moment.endMs / 1000} defaultValue={moment.startMs / 1000} className="w-20 rounded border border-zinc-700 bg-zinc-950 p-1" /></label>
                <label>End (s) <input name="end" type="number" step="0.001" required min={moment.startMs / 1000}
                  max={moment.endMs / 1000} defaultValue={moment.endMs / 1000} className="w-20 rounded border border-zinc-700 bg-zinc-950 p-1" /></label>
                <Button type="submit" variant="ghost" size="sm">Add speech clip</Button>
              </form>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
