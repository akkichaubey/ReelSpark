'use client';

import { useEffect, useRef, useState } from 'react';
import { CircleAlert, Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DialogDescription, DialogSurface, DialogTitle } from '@/components/ui/dialog';
import { isValidTitle, titleCategories, titleCategoryLabels, titleLimits, type TitleRequest, type TitleSuggestion } from '@/lib/title-suggestions';

type Source = Pick<TitleRequest, 'transcript'> & { context?: string };
type Options = Pick<TitleRequest, 'mode' | 'language' | 'platform'>;
type Props = {
  sourceKey: string;
  source: Source | ((signal: AbortSignal) => Source | Promise<Source>);
  platform?: Options['platform'];
  applyLabel?: string;
  onApply: (title: string) => void | Promise<void>;
};

export function TitleSuggestionsButton(props: Props) {
  return <TitleSuggestionsLauncher key={props.sourceKey} {...props} />;
}

function TitleSuggestionsLauncher(props: Props) {
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" variant="outline" size="sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <Sparkles size={14} aria-hidden="true" /> AI Titles
    </Button>
    {open && <TitleSuggestionsDialog {...props} onClose={() => setOpen(false)} />}
  </>;
}

function TitleSuggestionsDialog({ source, platform, onApply, applyLabel = 'Apply title', onClose }: Props & { onClose: () => void }) {
  const [options, setOptions] = useState<Options>({ mode: 'viral', language: 'hinglish', platform: platform || 'youtube' });
  const [suggestions, setSuggestions] = useState<TitleSuggestion[]>([]);
  const [draft, setDraft] = useState('');
  const [selectedTitle, setSelectedTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const controller = useRef<AbortController | null>(null);
  const resolvedSource = useRef<Source | null>(null);
  const [retry, setRetry] = useState<{ action: 'all' | 'more' | 'one'; target?: TitleSuggestion } | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const generate = async (action: 'all' | 'more' | 'one', target?: TitleSuggestion) => {
    if (controller.current || saving) return;
    setRetry({ action, target });
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const input = resolvedSource.current ?? (typeof source === 'function' ? await source(request.signal) : source);
      request.signal.throwIfAborted();
      if (!input.transcript.trim()) throw new Error('No transcript is available for this clip.');
      resolvedSource.current = input;
      const categories = target ? [target.category] : action === 'more' ? ['emotional', 'curiosity', 'seo'] : titleCategories;
      const response = await fetch('/api/title-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: request.signal,
        body: JSON.stringify({
          transcript: input.transcript,
          context: input.context,
          ...options,
          categories,
          exclude: [...new Set([draft.trim(), ...suggestions.map(item => item.title)].filter(title => title && title.length <= 200))].slice(0, 40),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (data?.retryable === false || response.status === 400 || response.status === 401 || response.status === 403) setRetry(null);
        throw new Error(data?.error || 'Unable to generate titles. Try again.');
      }
      if (!Array.isArray(data?.suggestions)) throw new Error('ReelSpark received an invalid response. Try again.');
      request.signal.throwIfAborted();
      const next: TitleSuggestion[] = data.suggestions;
      setSuggestions(previous => {
        if (action === 'one') return previous.map(item => item === target ? next[0] : item);
        return action === 'more' ? [...previous, ...next] : next;
      });
      setStatus(`${next.length} title ${next.length === 1 ? 'suggestion' : 'suggestions'} ready.`);
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to generate titles.');
    } finally {
      if (controller.current === request) controller.current = null;
      if (!request.signal.aborted) setBusy(false);
    }
  };

  const copy = async (title: string) => {
    try {
      await navigator.clipboard.writeText(title);
      setStatus('Title copied.');
    } catch {
      setStatus('Could not copy. Select the title text and copy it manually.');
    }
  };

  const apply = async () => {
    if (!isValidTitle(draft, options.platform) || saving || busy) return;
    setSaving(true);
    setError('');
    setRetry(null);
    try {
      await onApply(draft.trim());
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the title.');
    } finally {
      setSaving(false);
    }
  };

  const changeOption = <K extends keyof Options>(key: K, value: Options[K]) => {
    setOptions(previous => ({ ...previous, [key]: value }));
    setSuggestions([]);
    setError('');
    setStatus('');
    setRetry(null);
  };
  const noTranscript = typeof source !== 'function' && !source.transcript.trim();
  const recommended = suggestions.reduce<TitleSuggestion | undefined>((best, item) => !best || item.score > best.score ? item : best, undefined);
  const control = 'block w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-60';
  return <DialogSurface onClose={() => { if (!saving) onClose(); }}
    overlayClassName="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-3 sm:p-6"
    className="max-h-[90dvh] w-full max-w-2xl space-y-4 overflow-auto rounded-xl border border-zinc-700 bg-zinc-950 p-4 text-zinc-100 shadow-2xl sm:p-6">
    <header className="flex items-start justify-between gap-3">
      <div>
        <DialogTitle className="text-lg font-semibold">AI Title Generator</DialogTitle>
        <DialogDescription className="text-sm text-zinc-400">Titles based on the selected transcript. Scores are editorial estimates.</DialogDescription>
      </div>
      <Button type="button" variant="ghost" size="icon" aria-label="Close title generator" disabled={saving} onClick={onClose}><X size={18} /></Button>
    </header>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="grid gap-1.5 text-xs font-medium">Mode
        <select className={control} value={options.mode} disabled={busy || saving} onChange={event => changeOption('mode', event.target.value as Options['mode'])}>
          <option value="viral">Viral</option><option value="meaningful">Meaningful</option><option value="seo">SEO Optimized</option>
        </select>
      </label>
      <label className="grid gap-1.5 text-xs font-medium">Language
        <select className={control} value={options.language} disabled={busy || saving} onChange={event => changeOption('language', event.target.value as Options['language'])}>
          <option value="hinglish">Hinglish</option><option value="hi">Hindi</option><option value="en">English</option><option value="auto">Auto Detect</option>
        </select>
      </label>
      <label className="grid gap-1.5 text-xs font-medium">Platform
        <select className={control} value={options.platform} disabled={busy || saving} onChange={event => changeOption('platform', event.target.value as Options['platform'])}>
          <option value="youtube">YouTube Shorts</option><option value="instagram">Instagram Reels</option><option value="facebook">Facebook Reels</option><option value="threads">Threads</option>
        </select>
      </label>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="default" size="sm" disabled={noTranscript || busy || saving} onClick={() => void generate('all')}>
        {busy && <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden="true" />}
        {busy ? 'Generating…' : suggestions.length ? 'Regenerate all' : 'Generate titles'}
      </Button>
      {!isEditingTitle && <Button type="button" variant="outline" size="sm" onClick={() => setIsEditingTitle(true)}>Enter title manually</Button>}
      {suggestions.length > 0 && <Button type="button" variant="outline" size="sm" disabled={busy || saving || suggestions.length > 35} onClick={() => void generate('more')}>Generate 3 more</Button>}
    </div>
    {noTranscript && <p className="text-sm text-zinc-400">Add or generate a transcript for this clip to get title suggestions.</p>}
    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
      <p role="alert" className="flex min-w-0 flex-1 items-start gap-2 text-sm text-red-300">
        <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{error}</span>
      </p>
      {retry && <Button type="button" variant="outline" size="sm" disabled={busy || saving} onClick={() => void generate(retry.action, retry.target)}>Retry</Button>}
    </div>}
    {(suggestions.length > 0 || busy) && <div className="grid gap-2" aria-busy={busy}>
      {suggestions.map(item => <article key={item.title} className={`min-w-0 space-y-2 rounded-lg border p-3 ${item === recommended ? 'border-amber-500/60 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900'}`}>
        <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-zinc-400">
          <span>{titleCategoryLabels[item.category]}{item === recommended && <strong className="ml-2 text-amber-400">AI Recommended</strong>}</span>
          <span aria-label={`Estimated viral potential ${item.score} out of 100`}>{item.score}/100</span>
        </div>
        <h3 className="break-words font-semibold">{item.title}</h3>
        <p className="text-sm text-zinc-300">{item.explanation}</p>
        <blockquote className="break-words border-l-2 border-zinc-700 pl-2 text-xs text-zinc-400">{item.evidence}</blockquote>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" aria-pressed={selectedTitle === item.title} disabled={busy || saving}
            onClick={() => { setDraft(item.title); setSelectedTitle(item.title); setIsEditingTitle(true); }}>Select / Edit</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void copy(item.title)}>Copy</Button>
          <Button type="button" variant="outline" size="sm" disabled={busy || saving} onClick={() => void generate('one', item)}>Regenerate</Button>
        </div>
      </article>)}
    </div>}
    {isEditingTitle && <div className="space-y-2 border-t border-zinc-800 pt-3">
      <label className="block text-sm font-medium">Selected title
        <Input className={`mt-1 ${control}`} value={draft} onChange={event => setDraft(event.target.value)} disabled={saving} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="default" size="sm" disabled={busy || saving || !isValidTitle(draft, options.platform)} onClick={() => void apply()}>{saving ? 'Saving…' : applyLabel}</Button>
        <Button type="button" variant="outline" size="sm" disabled={!draft.trim()} onClick={() => void copy(draft.trim())}>Copy edited title</Button>
        <span className="text-xs text-zinc-400">{draft.trim().length}/{titleLimits[options.platform]}</span>
      </div>
    </div>}
    <p role="status" className={status ? 'text-xs text-zinc-400' : 'sr-only'}>{status}</p>
  </DialogSurface>;
}
