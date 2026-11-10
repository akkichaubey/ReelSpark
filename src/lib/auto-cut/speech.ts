import type { AutoCutClipCandidate } from './types';

type Word = NonNullable<AutoCutClipCandidate['transcriptWords']>[number];

export function measureSpeechSignal(wav?: Buffer): AutoCutClipCandidate['audioQuality'] {
  if (!wav || wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF') return 'unknown';
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4);
    if (wav.toString('ascii', offset, offset + 4) === 'data') {
      const start = offset + 8;
      const end = Math.min(wav.length, start + size);
      let count = 0, energy = 0, clipped = 0;
      for (let index = start; index + 1 < end; index += 8) {
        const sample = wav.readInt16LE(index) / 32768;
        energy += sample * sample;
        if (Math.abs(sample) >= 0.99) clipped++;
        count++;
      }
      if (!count) return 'unknown';
      if (clipped / count > 0.01) return 'clipped_signal';
      const rms = Math.sqrt(energy / count);
      if (rms < 0.0001) return 'silent_signal';
      return rms < 0.012 ? 'quiet_signal' : 'clear_signal';
    }
    offset += 8 + size + (size % 2);
  }
  return 'unknown';
}

export interface SpeechMoment {
  id: string;
  sourceVideoId?: string;
  startMs: number;
  endMs: number;
  words: Word[];
  language: NonNullable<AutoCutClipCandidate['speechLanguage']>;
  speaker: 'unknown';
  kind: NonNullable<AutoCutClipCandidate['speechHighlight']>;
  score: number;
  complete: boolean;
  repeat: boolean;
  fillerCount: number;
  timing: NonNullable<AutoCutClipCandidate['speechTiming']>;
  signal: NonNullable<AutoCutClipCandidate['audioQuality']>;
  context: AutoCutClipCandidate;
}

const sentenceEnd = /[.!?।！？][”"'’)]*$/u;

export function buildSpeechMoments(candidates: AutoCutClipCandidate[]): SpeechMoment[] {
  const sources = new Map<string | undefined, AutoCutClipCandidate[]>();
  for (const clip of candidates) {
    if (clip.audioQuality === 'silent_signal' || (clip.measuredSilence && !clip.audioQuality) || !clip.transcriptWords?.length) continue;
    const source = sources.get(clip.sourceVideoId) ?? [];
    source.push(clip);
    sources.set(clip.sourceVideoId, source);
  }
  const moments: SpeechMoment[] = [];
  for (const [sourceVideoId, clips] of sources) {
    const entries = clips.flatMap(clip => (clip.transcriptWords ?? []).filter(word =>
      word.text.trim() && word.startMs >= clip.startMs && word.endMs <= clip.endMs && word.endMs > word.startMs)
      .map(word => ({ word, clip }))).sort((a, b) => a.word.startMs - b.word.startMs || a.word.endMs - b.word.endMs);
    const seen = new Set<string>();
    let pending: typeof entries = [];
    const flush = (complete: boolean) => {
      if (!pending.length) return;
      const words = pending.map(entry => entry.word);
      const startMs = words[0].startMs;
      const endMs = Math.max(...words.map(word => word.endMs));
      const context = pending.reduce((best, entry) =>
        (entry.clip.speechClarity ?? entry.clip.audioScore) > (best.speechClarity ?? best.audioScore) ? entry.clip : best,
      pending[0].clip);
      const text = words.map(word => word.text).join(' ');
      const normalized = text.toLowerCase().replace(/[\p{P}\p{S}]+/gu, '').trim();
      const repeat = words.length >= 3 && seen.has(normalized);
      if (words.length >= 3) seen.add(normalized);
      const fillerCount = words.filter(word => /^(um+|uh+|erm+|हम्म|अं)[,.!?।]*$/iu.test(word.text)).length;
      const languages = new Set(pending.map(entry => entry.clip.speechLanguage).filter(Boolean));
      const language = languages.size > 1 ? 'mixed' : [...languages][0] ??
        (/[\u0900-\u097f]/u.test(text) ? /[a-z]/i.test(text) ? 'mixed' : 'hindi' : 'unknown');
      const signal = context.audioQuality ?? 'unknown';
      const score = Math.max(0, Math.min(100, Math.round(
        context.audioScore * 0.2 + (context.speechClarity ?? context.audioScore) * 0.2 +
        (context.speechHook ?? 0) * 0.15 + context.visualActionScore * 0.15 + context.score * 0.1 +
        (complete ? 20 : 0) - (repeat ? 20 : 0) - (signal === 'clipped_signal' || signal === 'quiet_signal' ? 10 : 0))));
      moments.push({ id: `speech:${sourceVideoId ?? 'source'}:${startMs}:${endMs}`, sourceVideoId,
        startMs, endMs, words, language, speaker: 'unknown', score, complete, repeat, fillerCount, signal,
        kind: context.speechHighlight && context.speechHighlight !== 'none' ? context.speechHighlight : /[?？]$/u.test(text) ? 'question' : 'none',
        timing: pending.some(entry => entry.clip.speechTiming !== 'provider_segment') ? 'provider_estimate' : 'provider_segment',
        context });
      pending = [];
    };
    const unique = new Set<string>();
    for (const [index, entry] of entries.entries()) {
      const { word } = entry;
      const key = `${word.startMs}:${word.endMs}:${word.text}`;
      if (unique.has(key)) continue;
      unique.add(key);
      const previous = pending.at(-1);
      // Keep pauses inside a supplied window or across contiguous reviewed windows.
      if (previous && entry.clip.startMs > previous.clip.endMs) flush(false);
      pending.push(entry);
      // A period at a provider-window edge can still be an estimate.
      if (sentenceEnd.test(word.text) && (entries[index + 1]?.word.startMs ?? Infinity) >=
        Math.max(...pending.map(item => item.word.endMs))) flush(true);
    }
    flush(false);
  }
  return moments;
}

export function speechClip(moment: SpeechMoment, startMs = moment.startMs, endMs = moment.endMs): AutoCutClipCandidate {
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || startMs < moment.startMs ||
    endMs > moment.endMs || startMs >= endMs || moment.words.some(word =>
      (word.startMs < startMs && word.endMs > startMs) || (word.startMs < endMs && word.endMs > endMs))) {
    throw new Error('Choose a range inside this moment that does not cut through a timed word or segment.');
  }
  const words = moment.words.filter(word => word.startMs >= startMs && word.endMs <= endMs);
  if (!words.length) throw new Error('Include at least one timed word or segment.');
  return { ...moment.context, id: moment.id, sourceVideoId: moment.sourceVideoId, startMs, endMs,
    durationMs: endMs - startMs, score: moment.score, selected: true,
    category: words.map(word => word.text).join(' '), speechProtected: true,
    transcriptWords: words };
}
