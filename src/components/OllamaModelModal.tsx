'use client';
import { accountCache } from '@/lib/account-cache';

import React, { useState, useEffect } from 'react';
import {
  Save,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  Cpu,
  Server,
  Terminal,
  Key,
  Eye,
  EyeOff,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';

export interface AiModelOption {
  id: string;
  name: string;
  badge?: string;
  description: string;
  speed: string;
  quality: string;
  recommended?: boolean;
}

interface OllamaModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentModel: string;
  onModelSaved: (newModel: string) => void;
}

const OLLAMA_MODELS: AiModelOption[] = [
  {
    id: 'llama3.2',
    name: 'Llama 3.2 (3B)',
    badge: 'Recommended',
    description: 'Lightweight, ultra-fast 3B model for instant viral clip discovery and scoring with minimal RAM.',
    speed: 'Ultra Fast',
    quality: 'Very High',
    recommended: true,
  },
  {
    id: 'llama3.1',
    name: 'Llama 3.1 (8B)',
    badge: 'Deep Reasoning',
    description: 'Meta’s powerful 8B model with frontier logic for complex podcasts, philosophical talks, and humor.',
    speed: 'Fast',
    quality: 'Maximum',
  },
  {
    id: 'qwen2.5',
    name: 'Qwen 2.5 (7B)',
    badge: 'Best for Hindi & Multilingual',
    description: 'Outstanding multilingual awareness with native Hindi and Hinglish sentence understanding.',
    speed: 'Fast',
    quality: 'Maximum',
  },
  {
    id: 'mistral',
    name: 'Mistral (7B)',
    badge: 'Creative & Catchy',
    description: 'Mistral 7B optimized for engaging viral punchlines, hooks, and story highlights.',
    speed: 'Very Fast',
    quality: 'High',
  },
  {
    id: 'gemma2',
    name: 'Gemma 2 (9B)',
    badge: 'Google Open Weights',
    description: 'Google’s open-weights architecture for deep educational and inspirational topics.',
    speed: 'Moderate',
    quality: 'Very High',
  },
  {
    id: 'phi3',
    name: 'Phi-3 Mini (3.8B)',
    badge: 'Ultra Lightweight',
    description: 'Microsoft compact model that runs smoothly on any low-end hardware or CPU without GPU.',
    speed: 'Maximum',
    quality: 'Good',
  },
];

const GEMINI_MODELS: AiModelOption[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    badge: 'Recommended Cloud',
    description: 'Fast multimodal model with 1M context window and free tier support from Google AI Studio.',
    speed: 'Ultra Fast',
    quality: 'Maximum',
    recommended: true,
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    badge: 'Production Standard',
    description: 'Ultra-low latency model with reliable JSON formatting and instant response times.',
    speed: 'Ultra Fast',
    quality: 'Very High',
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    badge: 'High Rate Limit',
    description: 'Standard workhorse model with generous 15 RPM free tier limits for cloud use.',
    speed: 'Fast',
    quality: 'High',
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    badge: 'Deep Reasoning',
    description: 'Heavy reasoning model for complex academic, philosophical, and long-form video analysis.',
    speed: 'Moderate',
    quality: 'Maximum',
  },
];

export const OllamaModelModal: React.FC<OllamaModelModalProps> = ({
  isOpen,
  onClose,
  currentModel,
  onModelSaved,
}) => {
  const [provider, setProvider] = useState<'ollama' | 'gemini'>('ollama');

  // Ollama states
  const [ollamaModel, setOllamaModel] = useState<string>('llama3.2');
  const [baseUrlInput, setBaseUrlInput] = useState<string>('http://127.0.0.1:11434');
  const [isCustomModel, setIsCustomModel] = useState<boolean>(false);
  const [customModelInput, setCustomModelInput] = useState<string>('');

  // Gemini (BYOK) states
  const [geminiModel, setGeminiModel] = useState<string>('gemini-2.5-flash');
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);

  // Status & feedback
  const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(false);
  const [ollamaUnavailableReason, setOllamaUnavailableReason] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load existing settings on modal open
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setIsLoadingSettings(true);
    setTestResult(null);
    setErrorMessage(null);

    // Read stored user key from localStorage if available
    const localKey = typeof window !== 'undefined' ? accountCache.getItem('reelspark_user_gemini_key') : null;
    if (localKey) {
      setApiKeyInput(localKey);
    }

    const loadSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Unable to load server settings');
        if (active && data.success) {
          const unavailableReason = typeof data.ollamaUnavailableReason === 'string'
            ? data.ollamaUnavailableReason
            : null;
          setOllamaUnavailableReason(unavailableReason);
          const requestedProvider = currentModel
            ? currentModel.startsWith('gemini') ? 'gemini' : 'ollama'
            : data.provider || 'ollama';
          setProvider(requestedProvider === 'ollama' && unavailableReason ? 'gemini' : requestedProvider);
          if (data.baseUrl) {
            setBaseUrlInput(data.baseUrl);
          }
          if (data.ollamaModel) {
            setOllamaModel(data.ollamaModel);
          }
          if (data.geminiModel) {
            setGeminiModel(data.geminiModel);
          }

          // If currentModel is passed, determine which provider it belongs to
          if (currentModel) {
            if (currentModel.startsWith('gemini')) {
              setGeminiModel(currentModel);
            } else {
              const isPredefined = OLLAMA_MODELS.some((m) => m.id === currentModel);
              if (isPredefined) {
                setOllamaModel(currentModel);
                setIsCustomModel(false);
              } else {
                setIsCustomModel(true);
                setCustomModelInput(currentModel);
              }
            }
          }
        }
      } catch (err: any) {
        console.error('Failed to load settings:', err);
      } finally {
        if (active) setIsLoadingSettings(false);
      }
    };

    loadSettings();
    return () => {
      active = false;
    };
  }, [isOpen, currentModel]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    try {
      setIsTesting(true);
      setTestResult(null);
      setErrorMessage(null);

      const targetModel =
        provider === 'gemini'
          ? geminiModel
          : isCustomModel
          ? customModelInput.trim()
          : ollamaModel;

      if (!targetModel) {
        setErrorMessage('Please specify or select a valid model name.');
        setIsTesting(false);
        return;
      }

      if (provider === 'gemini' && !apiKeyInput.trim()) {
        setErrorMessage('Please enter your Google Gemini API key to test connection. You can get one for free at aistudio.google.com');
        setIsTesting(false);
        return;
      }

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          provider,
          model: targetModel,
          baseUrl: baseUrlInput.trim() || 'http://127.0.0.1:11434',
          apiKey: apiKeyInput.trim(),
        }),
      });

      const data = await res.json();
      setTestResult({
        success: Boolean(data.success),
        message: data.message || (data.success ? 'Connection verified successfully!' : 'Test failed.'),
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Cannot establish connection to AI provider.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setErrorMessage(null);

      const targetModel =
        provider === 'gemini'
          ? geminiModel
          : isCustomModel
          ? customModelInput.trim()
          : ollamaModel;

      if (!targetModel) {
        setErrorMessage('Please select or specify a valid model.');
        setIsSaving(false);
        return;
      }

      // Save user's personal key to client-side localStorage so it persists per browser
      if (typeof window !== 'undefined') {
        if (provider === 'gemini' && apiKeyInput.trim()) {
          accountCache.setItem('reelspark_user_gemini_key', apiKeyInput.trim());
        } else if (provider === 'gemini' && !apiKeyInput.trim()) {
          accountCache.removeItem('reelspark_user_gemini_key');
        }
      }

      const payload: any = {
        provider,
        model: targetModel,
        baseUrl: baseUrlInput.trim() || 'http://127.0.0.1:11434',
        apiKey: apiKeyInput.trim(),
      };

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        onModelSaved(targetModel);
        onClose();
      } else {
        throw new Error(data.error || 'Failed to save settings');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update AI settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden my-8 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-md">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold text-white tracking-tight">AI Engine & Model Selector</h3>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Choose between Free Local Ollama (No API Key) or Google Gemini (Bring Your Own Key)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Provider Switcher Tabs */}
        <div className="px-6 pt-4 pb-2 bg-zinc-900/30 border-b border-white/5 flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              setProvider('ollama');
              setTestResult(null);
            }}
            disabled={Boolean(ollamaUnavailableReason)}
            title={ollamaUnavailableReason || undefined}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
              provider === 'ollama'
                ? 'bg-amber-400 text-zinc-950 border-amber-400 shadow-md'
                : 'bg-zinc-900/80 text-zinc-400 border-white/10 hover:text-white hover:bg-zinc-800'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <Cpu className="w-4 h-4" />
            <span>{ollamaUnavailableReason ? 'Ollama (Not available on this host)' : 'Ollama (Free & Local — No API Key)'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setProvider('gemini');
              setTestResult(null);
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
              provider === 'gemini'
                ? 'bg-amber-400 text-zinc-950 border-amber-400 shadow-md'
                : 'bg-zinc-900/80 text-zinc-400 border-white/10 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>Google Gemini (Add Your Key)</span>
          </button>
        </div>

        {ollamaUnavailableReason && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-100 flex items-start gap-2 text-xs">
            <AlertCircle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <span className="font-semibold">Ollama is unavailable in the hosted app.</span>{' '}
              {ollamaUnavailableReason} The <code className="font-mono">127.0.0.1</code> address refers to the Render server here, not your computer. Ollama remains available when ReelSpark runs locally beside Ollama.
            </p>
          </div>
        )}

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* TAB 1: OLLAMA CONFIGURATION */}
          {provider === 'ollama' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-white flex items-center space-x-2">
                    <Server className="w-4 h-4 text-amber-400" />
                    <span>Ollama Local Host URL</span>
                  </label>
                  <span className="text-[11px] text-emerald-400 font-semibold">Zero API Key Needed</span>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={baseUrlInput}
                    onChange={(e) => setBaseUrlInput(e.target.value)}
                    placeholder="http://127.0.0.1:11434"
                    className="flex-1 px-3 py-2 bg-zinc-950 border border-white/10 rounded-xl text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-amber-400/50 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-400" />}
                    <span>Ping</span>
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Make sure Ollama is running: <code className="text-amber-300 font-mono">ollama serve</code> (Download from <a href="https://ollama.com" target="_blank" rel="noreferrer" className="text-amber-400 underline">ollama.com</a>)</span>
                </p>
              </div>

              {/* Ollama Models Catalog */}
              <div className="space-y-2">
                <label className="font-semibold text-white uppercase tracking-wider text-[11px] block">
                  Select Local Ollama Model
                </label>
                {OLLAMA_MODELS.map((m) => {
                  const isSelected = !isCustomModel && ollamaModel === m.id;
                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        setOllamaModel(m.id);
                        setIsCustomModel(false);
                        setTestResult(null);
                      }}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-400 shadow-sm'
                          : 'bg-zinc-900/40 border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isSelected ? 'border-amber-400 bg-amber-400' : 'border-zinc-600'}`}>
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-zinc-950" />}
                          </div>
                          <span className="font-bold text-white text-xs">{m.name}</span>
                          <span className="font-mono text-[10px] text-zinc-400 px-1.5 py-0.2 bg-zinc-800 rounded">{m.id}</span>
                          {m.badge && (
                            <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              {m.badge}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-400">{m.speed}</span>
                      </div>
                      <p className="text-zinc-400 text-[11px] mt-1 pl-6">{m.description}</p>
                    </div>
                  );
                })}

                {/* Custom Model */}
                <div
                  onClick={() => {
                    setIsCustomModel(true);
                    setTestResult(null);
                  }}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isCustomModel
                      ? 'bg-amber-500/10 border-amber-400 shadow-sm'
                      : 'bg-zinc-900/40 border-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isCustomModel ? 'border-amber-400 bg-amber-400' : 'border-zinc-600'}`}>
                      {isCustomModel && <div className="w-1.5 h-1.5 rounded-full bg-zinc-950" />}
                    </div>
                    <span className="font-bold text-white text-xs">Custom Ollama Model</span>
                  </div>
                  {isCustomModel && (
                    <div className="mt-2 pl-6">
                      <input
                        type="text"
                        value={customModelInput}
                        onChange={(e) => setCustomModelInput(e.target.value)}
                        placeholder="e.g. deepseek-r1:7b or llama3:instruct"
                        className="w-full px-3 py-1.5 bg-zinc-950 border border-white/10 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-amber-400/50"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* TAB 2: GOOGLE GEMINI (BYOK — BRING YOUR OWN KEY) */
            <div className="space-y-4">
              {/* Privacy Shield Banner */}
              <div className="p-3.5 rounded-xl bg-sky-950/40 border border-sky-500/30 flex items-start space-x-2.5 text-sky-200">
                <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-xs text-white">Bring Your Own Key (BYOK) — Zero Cost to Website Owner</p>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">
                    Paste your personal Google Gemini API key below. Your key is stored in your own browser/session. The website owner&apos;s API key is never used or charged.
                  </p>
                </div>
              </div>

              {/* API Key Input */}
              <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-white flex items-center space-x-1.5">
                    <Key className="w-4 h-4 text-amber-400" />
                    <span>Your Personal Google Gemini API Key</span>
                  </label>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold underline"
                  >
                    <span>Get Free Key</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full px-3 py-2 pr-10 bg-zinc-950 border border-white/10 rounded-xl text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-amber-400/50 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-white"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Gemini Models Catalog */}
              <div className="space-y-2">
                <label className="font-semibold text-white uppercase tracking-wider text-[11px] block">
                  Select Gemini Cloud Model
                </label>
                {GEMINI_MODELS.map((m) => {
                  const isSelected = geminiModel === m.id;
                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        setGeminiModel(m.id);
                        setTestResult(null);
                      }}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-400 shadow-sm'
                          : 'bg-zinc-900/40 border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isSelected ? 'border-amber-400 bg-amber-400' : 'border-zinc-600'}`}>
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-zinc-950" />}
                          </div>
                          <span className="font-bold text-white text-xs">{m.name}</span>
                          <span className="font-mono text-[10px] text-zinc-400 px-1.5 py-0.2 bg-zinc-800 rounded">{m.id}</span>
                          {m.badge && (
                            <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                              {m.badge}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-400">{m.speed}</span>
                      </div>
                      <p className="text-zinc-400 text-[11px] mt-1 pl-6">{m.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Test Feedback Banner */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border flex items-start space-x-2.5 animate-in fade-in ${
                testResult.success
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                  : 'bg-amber-950/40 border-amber-500/30 text-amber-200'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <p className="font-semibold">{testResult.success ? 'Verification Successful' : 'Notice'}</p>
                <p className="text-[11px] opacity-90 leading-relaxed">{testResult.message}</p>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">{errorMessage}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 border-t border-white/10 bg-zinc-900/60 flex items-center justify-between">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            className="px-4 py-2.5 rounded-xl border border-white/10 hover:bg-zinc-800 text-zinc-300 hover:text-white font-semibold text-xs flex items-center space-x-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 text-amber-400" />}
            <span>Test Connection</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-zinc-400 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs flex items-center space-x-2 shadow-lg shadow-white/10 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save & Apply Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const GeminiModelModal = OllamaModelModal;
