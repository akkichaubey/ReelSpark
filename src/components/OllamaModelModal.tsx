'use client';

import { accountCache } from '@/lib/account-cache';
import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Key,
  Loader2,
  Save,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react';

interface OllamaModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentModel: string;
  onModelSaved: (newModel: string) => void;
}

type Provider = 'ollama-cloud' | 'gemini';

const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', badge: 'Recommended', description: 'Fast multimodal model. Uses the Gemini API key you provide.' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', badge: 'Production Standard', description: 'Low-latency model for general AI tasks.' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', badge: 'High Rate Limit', description: 'Fast model for lighter requests.' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', badge: 'Deep Reasoning', description: 'Higher-capability model for complex analysis.' },
];

export const OllamaModelModal: React.FC<OllamaModelModalProps> = ({
  isOpen,
  onClose,
  currentModel,
  onModelSaved,
}) => {
  const [provider, setProvider] = useState<Provider>('ollama-cloud');
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [cloudKeyConfigured, setCloudKeyConfigured] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setIsLoadingSettings(true);
    setTestResult(null);
    setErrorMessage(null);

    const cachedGeminiKey = accountCache.getItem('reelspark_user_gemini_key');
    setApiKeyInput(cachedGeminiKey || '');

    void (async () => {
      try {
        const res = await fetch('/api/settings', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Unable to load server settings');
        if (!active || !data.success) return;

        setProvider(data.provider === 'gemini' ? 'gemini' : 'ollama-cloud');
        setCloudKeyConfigured(Boolean(data.ollamaCloudApiKeyConfigured));
        if (typeof data.geminiModel === 'string') setGeminiModel(data.geminiModel);

        // Older projects may carry a model name in their own settings. Keep
        // provider selection authoritative, and only restore a valid Gemini model.
        if (currentModel?.startsWith('gemini')) setGeminiModel(currentModel);
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : 'Unable to load AI settings.');
      } finally {
        if (active) setIsLoadingSettings(false);
      }
    })();

    return () => { active = false; };
  }, [isOpen, currentModel]);

  if (!isOpen) return null;

  const selectedModel = provider === 'gemini' ? geminiModel : 'gemma4';

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setErrorMessage(null);
    try {
      if (provider === 'ollama-cloud' && !cloudKeyConfigured) {
        throw new Error('Ollama Cloud is not configured yet. Add OLLAMA_API_KEY to the server environment first.');
      }
      if (provider === 'gemini' && !apiKeyInput.trim()) {
        throw new Error('Enter your Google Gemini API key to test the connection.');
      }

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          provider,
          model: selectedModel,
          ...(provider === 'gemini' ? { apiKey: apiKeyInput.trim() } : {}),
        }),
      });
      const data = await res.json();
      setTestResult({
        success: Boolean(data.success),
        message: data.message || (data.success ? 'Connection verified.' : data.error || 'Connection test failed.'),
      });
    } catch (error) {
      setTestResult({ success: false, message: error instanceof Error ? error.message : 'Could not connect to the AI provider.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      if (provider === 'ollama-cloud' && !cloudKeyConfigured) {
        throw new Error('Add OLLAMA_API_KEY to the server environment before enabling Ollama Cloud.');
      }
      if (provider === 'gemini' && !apiKeyInput.trim()) {
        throw new Error('Enter your Gemini API key before saving this provider.');
      }

      if (provider === 'gemini') accountCache.setItem('reelspark_user_gemini_key', apiKeyInput.trim());

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model: selectedModel,
          ...(provider === 'gemini' ? { apiKey: apiKeyInput.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save AI settings.');
      onModelSaved(selectedModel);
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update AI settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const chooseProvider = (next: Provider) => {
    setProvider(next);
    setTestResult(null);
    setErrorMessage(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="my-8 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 bg-zinc-900/60 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight text-white">AI Engine &amp; Model Selector</h3>
              <p className="mt-0.5 text-xs text-zinc-400">Ollama Cloud starter model or your Gemini API key</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close AI settings" className="rounded-xl p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-2 border-b border-white/5 bg-zinc-900/30 px-4 pb-3 pt-4 sm:px-6">
          <button type="button" onClick={() => chooseProvider('ollama-cloud')} className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition-all ${provider === 'ollama-cloud' ? 'border-amber-400 bg-amber-400 text-zinc-950' : 'border-white/10 bg-zinc-900/80 text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>
            <Cpu className="h-4 w-4" /> Ollama Cloud (Free Starter)
          </button>
          <button type="button" onClick={() => chooseProvider('gemini')} className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition-all ${provider === 'gemini' ? 'border-amber-400 bg-amber-400 text-zinc-950' : 'border-white/10 bg-zinc-900/80 text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>
            <Key className="h-4 w-4" /> Google Gemini (Your Key)
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 text-xs sm:p-6">
          {isLoadingSettings ? (
            <div className="flex items-center justify-center gap-2 py-12 text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading provider settings…</div>
          ) : provider === 'ollama-cloud' ? (
            <>
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/25 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                  <div className="space-y-1.5">
                    <p className="font-bold text-white">Gemma 4 Cloud — Ollama starter model</p>
                    <p className="leading-relaxed text-zinc-300">Inference runs on Ollama’s servers. ReelSpark does not need Ollama installed on your PC or Render. Only the server uses the API key; it is never sent to the browser.</p>
                  </div>
                </div>
              </div>

              <div className={`flex items-center justify-between gap-3 rounded-xl border p-4 ${cloudKeyConfigured ? 'border-emerald-500/30 bg-emerald-950/20' : 'border-amber-500/30 bg-amber-950/20'}`}>
                <div className="flex items-center gap-2.5">
                  {cloudKeyConfigured ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertCircle className="h-4 w-4 text-amber-400" />}
                  <div>
                    <p className="font-semibold text-white">Server API key</p>
                    <p className="mt-0.5 text-[11px] text-zinc-400">{cloudKeyConfigured ? 'OLLAMA_API_KEY is configured' : 'OLLAMA_API_KEY is not configured on this server'}</p>
                  </div>
                </div>
                {!cloudKeyConfigured && (
                  <a href="https://ollama.com/settings/keys" target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-2 font-semibold text-amber-300 hover:bg-amber-500/10">
                    Create API key <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              {!cloudKeyConfigured && (
                <div className="space-y-2 rounded-xl border border-white/10 bg-zinc-900/50 p-4 text-zinc-300">
                  <p className="font-semibold text-white">Add it on the server</p>
                  <p>Local development: add <code className="rounded bg-zinc-950 px-1.5 py-0.5 font-mono text-amber-300">OLLAMA_API_KEY=your_key</code> to <code className="rounded bg-zinc-950 px-1.5 py-0.5 font-mono text-amber-300">.env.local</code>, then restart Next.js.</p>
                  <p>Render: open your service → Environment → add <code className="rounded bg-zinc-950 px-1.5 py-0.5 font-mono text-amber-300">OLLAMA_API_KEY</code> → save and redeploy. Never paste the key in chat or commit it.</p>
                </div>
              )}

              <div className="rounded-xl border border-amber-500/20 bg-amber-950/15 p-4 leading-relaxed text-amber-100/90">
                Ollama Free includes limited starter usage and Gemma 4 starter access; it is not unlimited. ReelSpark users share the server key’s account allowance. Check usage in your Ollama account, and ensure paid credits/automatic billing are not enabled if you want to avoid charges. Cloud availability, quotas, and concurrency are controlled by Ollama.
              </div>

              <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-white">Gemma 4 Cloud</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">Ollama starter model for multilingual generation and analysis.</p>
                  </div>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-300">FREE STARTER</span>
                </div>
                <p className="mt-3 font-mono text-[10px] text-zinc-500">API model ID: gemma4 · CLI alias: gemma4:cloud</p>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-2.5 rounded-xl border border-sky-500/30 bg-sky-950/30 p-3.5 text-sky-100">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                <div><p className="font-bold text-white">Bring Your Own Gemini API key</p><p className="mt-1 leading-relaxed text-zinc-300">This key is used only for Gemini requests. Keep it private and review Google AI Studio’s current quota and billing settings.</p></div>
              </div>
              <div className="space-y-3 rounded-xl border border-white/10 bg-zinc-900/50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="gemini-model-key" className="font-semibold text-white">Your Gemini API key</label>
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 underline">Get key <ExternalLink className="h-3 w-3" /></a>
                </div>
                <div className="relative">
                  <input id="gemini-model-key" type={showApiKey ? 'text' : 'password'} value={apiKeyInput} onChange={(event) => setApiKeyInput(event.target.value)} autoComplete="off" placeholder="AIzaSy…" className="w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 pr-11 font-mono text-xs text-white placeholder-zinc-600 focus:border-amber-400/50 focus:outline-none" />
                  <button type="button" onClick={() => setShowApiKey((value) => !value)} aria-label={showApiKey ? 'Hide API key' : 'Show API key'} className="absolute right-3 top-2.5 text-zinc-400 hover:text-white">{showApiKey ? 'Hide' : 'Show'}</button>
                </div>
              </div>
              <div className="space-y-2">
                <p className="font-semibold uppercase tracking-wider text-[11px] text-zinc-400">Select Gemini model</p>
                {GEMINI_MODELS.map((model) => {
                  const selected = geminiModel === model.id;
                  return <button key={model.id} type="button" onClick={() => { setGeminiModel(model.id); setTestResult(null); }} className={`w-full rounded-xl border p-3.5 text-left transition-all ${selected ? 'border-amber-400 bg-amber-500/10' : 'border-white/5 bg-zinc-900/40 hover:border-white/20'}`}>
                    <span className="flex flex-wrap items-center gap-2"><span className={`h-3.5 w-3.5 rounded-full border ${selected ? 'border-amber-400 bg-amber-400' : 'border-zinc-600'}`} /><span className="font-bold text-white">{model.name}</span><span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">{model.id}</span><span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-300">{model.badge}</span></span>
                    <span className="mt-1 block pl-6 text-[11px] text-zinc-400">{model.description}</span>
                  </button>;
                })}
              </div>
            </>
          )}

          {testResult && <div className={`flex items-start gap-2.5 rounded-xl border p-3.5 ${testResult.success ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-200' : 'border-amber-500/30 bg-amber-950/40 text-amber-200'}`}>
            {testResult.success ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />}
            <p className="leading-relaxed">{testResult.message}</p>
          </div>}
          {errorMessage && <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-950/40 p-3.5 text-red-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" /><p className="leading-relaxed">{errorMessage}</p></div>}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-zinc-900/60 p-4 sm:p-5">
          <button type="button" onClick={handleTestConnection} disabled={isLoadingSettings || isTesting || (provider === 'ollama-cloud' && !cloudKeyConfigured)} className="flex items-center gap-2 rounded-xl border border-white/10 px-3.5 py-2.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">
            {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 text-amber-400" />} Test Connection
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-xl px-3.5 py-2.5 text-xs font-medium text-zinc-400 transition-colors hover:text-white">Cancel</button>
            <button type="button" onClick={handleSave} disabled={isLoadingSettings || isSaving || (provider === 'ollama-cloud' && !cloudKeyConfigured)} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-zinc-950 shadow-lg transition-all hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save &amp; Apply Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const GeminiModelModal = OllamaModelModal;
