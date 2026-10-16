'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  Key,
  Eye,
  EyeOff,
  Cpu,
  Info,
  ExternalLink,
} from 'lucide-react';

export interface GeminiModelOption {
  id: string;
  name: string;
  badge?: string;
  description: string;
  speed: string;
  quality: string;
  recommended?: boolean;
}

interface GeminiModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentModel: string;
  onModelSaved: (newModel: string) => void;
}

export const GeminiModelModal: React.FC<GeminiModelModalProps> = ({
  isOpen,
  onClose,
  currentModel,
  onModelSaved,
}) => {
  const [selectedModel, setSelectedModel] = useState<string>(currentModel || 'gemini-3.8-flash');
  const [isCustomModel, setIsCustomModel] = useState<boolean>(false);
  const [customModelInput, setCustomModelInput] = useState<string>('');
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [hasServerApiKey, setHasServerApiKey] = useState<boolean>(false);
  const [models, setModels] = useState<GeminiModelOption[]>([]);
  const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch settings & available models on open
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setIsLoadingSettings(true);
    setTestResult(null);
    setErrorMessage(null);

    const loadSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (active && data.success) {
          if (data.availableModels && data.availableModels.length > 0) {
            setModels(data.availableModels);
          }
          setHasServerApiKey(data.configured || data.hasCustomApiKey);
          const activeModelId = data.model || currentModel || 'gemini-3.8-flash';

          // Check if active model is one of the predefined models
          const isPredefined = data.availableModels?.some((m: GeminiModelOption) => m.id === activeModelId);
          if (isPredefined) {
            setSelectedModel(activeModelId);
            setIsCustomModel(false);
          } else {
            setSelectedModel('custom');
            setIsCustomModel(true);
            setCustomModelInput(activeModelId);
          }
        }
      } catch (err: any) {
        console.error('Failed to load Gemini settings:', err);
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

  const effectiveModel = isCustomModel ? customModelInput.trim() || 'gemini-3.8-flash' : selectedModel;

  const handleTestConnection = async () => {
    try {
      setIsTesting(true);
      setTestResult(null);
      setErrorMessage(null);

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          model: effectiveModel,
          apiKey: apiKeyInput.trim() || undefined,
        }),
      });

      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.message || (data.success ? 'Connection verified!' : 'Connection test failed.'),
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Network error during connection test.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setErrorMessage(null);

      const targetModel = isCustomModel ? customModelInput.trim() : selectedModel;
      if (!targetModel) {
        setErrorMessage('Please enter or select a valid Gemini model.');
        setIsSaving(false);
        return;
      }

      const payload: any = {
        model: targetModel,
      };
      if (apiKeyInput.trim()) {
        payload.apiKey = apiKeyInput.trim();
      }

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
      setErrorMessage(err.message || 'Failed to update Gemini settings.');
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500/20 to-indigo-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold text-white tracking-tight">Gemini AI Model Selector</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  Google GenAI
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Select the Google Gemini model used for audio transcription and viral clip analysis
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
          {isLoadingSettings && (
            <div className="flex items-center justify-center py-8 space-x-2 text-zinc-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
              <span>Loading available Gemini models...</span>
            </div>
          )}

          {!isLoadingSettings && (
            <>
              {/* Models List */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center justify-between">
                  <span>Available Gemini Models</span>
                  <span className="text-zinc-500 text-[11px] font-normal">Choose one for video semantic analysis</span>
                </label>

                <div className="grid grid-cols-1 gap-2.5">
                  {models.map((m) => {
                    const isSelected = !isCustomModel && selectedModel === m.id;
                    return (
                      <div
                        key={m.id}
                        onClick={() => {
                          setSelectedModel(m.id);
                          setIsCustomModel(false);
                          setTestResult(null);
                        }}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                          isSelected
                            ? 'bg-sky-500/10 border-sky-400/60 shadow-lg shadow-sky-500/5 ring-1 ring-sky-400/30'
                            : 'bg-zinc-900/50 border-white/5 hover:border-white/20 hover:bg-zinc-900/80'
                        }`}
                      >
                        <div className="flex items-start space-x-3 flex-1 min-w-0">
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 transition-colors ${
                              isSelected
                                ? 'border-sky-400 bg-sky-500 text-zinc-950 font-bold'
                                : 'border-zinc-700 bg-zinc-800'
                            }`}
                          >
                            {isSelected && <div className="w-2 h-2 rounded-full bg-zinc-950" />}
                          </div>

                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-sm text-white">{m.name}</span>
                              <code className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                                {m.id}
                              </code>
                              {m.badge && (
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                                    m.recommended
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                      : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                                  }`}
                                >
                                  {m.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-400 leading-relaxed">{m.description}</p>
                            <div className="flex items-center gap-3 pt-1 text-[11px] text-zinc-500">
                              <span className="flex items-center gap-1">
                                <Zap className="w-3 h-3 text-amber-400" />
                                <span>Speed: <strong className="text-zinc-300 font-medium">{m.speed}</strong></span>
                              </span>
                              <span>•</span>
                              <span>
                                Quality: <strong className="text-zinc-300 font-medium">{m.quality}</strong>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Custom Model Option */}
                  <div
                    onClick={() => {
                      setIsCustomModel(true);
                      setSelectedModel('custom');
                      setTestResult(null);
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isCustomModel
                        ? 'bg-sky-500/10 border-sky-400/60 shadow-lg shadow-sky-500/5 ring-1 ring-sky-400/30'
                        : 'bg-zinc-900/50 border-white/5 hover:border-white/20 hover:bg-zinc-900/80'
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 transition-colors ${
                          isCustomModel
                            ? 'border-sky-400 bg-sky-500 text-zinc-950 font-bold'
                            : 'border-zinc-700 bg-zinc-800'
                        }`}
                      >
                        {isCustomModel && <div className="w-2 h-2 rounded-full bg-zinc-950" />}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-white">Custom / Other Gemini Model</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                            Custom ID
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400">
                          Specify any other Google GenAI model ID (e.g. gemini-2.0-flash-lite, preview models, etc.).
                        </p>
                        {isCustomModel && (
                          <div className="pt-1">
                            <input
                              type="text"
                              value={customModelInput}
                              onChange={(e) => setCustomModelInput(e.target.value)}
                              placeholder="e.g. gemini-2.0-flash-lite"
                              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/20 text-white text-xs font-mono focus:outline-none focus:border-sky-400"
                              autoFocus
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* API Key Configuration */}
              <div className="space-y-3 pt-2 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Gemini API Key (Optional Override)</span>
                  </label>
                  {hasServerApiKey ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Key Configured on Server</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                      <AlertCircle className="w-3 h-3" />
                      <span>Demo / Local Fallback Mode</span>
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={hasServerApiKey ? '•••••••••••••••••••••••• (Leave blank to keep current server key)' : 'AIzaSy... (Paste your Gemini API key)'}
                    className="w-full pr-10 pl-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-sky-400 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <p className="text-[11px] text-zinc-400 flex items-center justify-between">
                  <span>Your key is stored locally on this machine and never shared.</span>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400 hover:underline flex items-center gap-1"
                  >
                    <span>Get Free API Key</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>

              {/* Test Connection Result Box */}
              {testResult && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 transition-all animate-in fade-in ${
                    testResult.success
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                      : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 leading-relaxed">
                    <p className="font-semibold">{testResult.success ? 'Connection Verified' : 'Connection Notice'}</p>
                    <p className="text-[11px] opacity-90 mt-0.5">{testResult.message}</p>
                  </div>
                </div>
              )}

              {/* Error Alert */}
              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 border-t border-white/10 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting || isSaving}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-xs font-semibold border border-white/10 transition-colors"
          >
            {isTesting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                <span>Testing Connection...</span>
              </>
            ) : (
              <>
                <Cpu className="w-3.5 h-3.5 text-sky-400" />
                <span>Test Model ({effectiveModel})</span>
              </>
            )}
          </button>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-white hover:bg-zinc-200 disabled:opacity-50 text-zinc-950 text-xs sm:text-sm font-bold shadow-lg shadow-white/5 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
                  <span>Applying...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-zinc-950" />
                  <span>Save & Apply Model</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
