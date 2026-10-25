'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  ShieldCheck,
  Check,
  Copy,
  ExternalLink,
  AlertCircle,
  Loader2,
  Info,
} from 'lucide-react';
import { PublishingPlatformKey } from '@/lib/social-intelligence/publishing-types';
import { SocialPlatformIcon } from '@/components/social-intelligence/SocialPlatformIcon';

interface OAuthCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlatform?: PublishingPlatformKey;
  onSaved?: () => void;
}

export const OAuthCredentialsModal: React.FC<OAuthCredentialsModalProps> = ({
  isOpen,
  onClose,
  initialPlatform = 'instagram',
  onSaved,
}) => {
  const [canConfigure, setCanConfigure] = useState(false);
  const [platform, setPlatform] = useState<PublishingPlatformKey>(initialPlatform);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusList, setStatusList] = useState<any[]>([]);
  const [origin, setOrigin] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (initialPlatform) setPlatform(initialPlatform);
  }, [initialPlatform]);

  useEffect(() => {
    if (!isOpen) return;
    const fetchStatus = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/social-publishing/oauth/config');
        const data = await res.json();
        if (data.success) {
          setStatusList(data.platforms || []);
          setCanConfigure(data.canConfigure === true);
          if (data.origin) setOrigin(data.origin);
        }
      } catch (e) {
        console.warn('Failed to load credentials status:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, [isOpen]);

  if (!isOpen) return null;

  const currentRedirectUri = `${origin || (typeof window !== 'undefined' ? window.location.origin : '')}/api/social-publishing/oauth/${platform}/callback`;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId.trim() || !clientSecret.trim()) {
      setMessage({ type: 'error', text: 'Please fill in both Client/App ID and Secret.' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/social-publishing/oauth/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save credentials');
      }

      setMessage({ type: 'success', text: data.message });
      setClientId('');
      setClientSecret('');
      if (onSaved) onSaved();

      // Refresh status
      const statusRes = await fetch('/api/social-publishing/oauth/config');
      const statusData = await statusRes.json();
      if (statusData.success) setStatusList(statusData.platforms || []);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400 flex items-center justify-center text-zinc-950 font-black shadow-md shadow-amber-400/20">
              <Key className="w-5 h-5 text-zinc-950" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Configure Official Developer API Keys
              </h2>
              <p className="text-xs text-zinc-400">
                Connect your real account using your own Meta or Google Developer App credentials
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto max-h-[80vh] custom-scrollbar">
          {message && (
            <div
              className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs ${
                message.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {message.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Platform Selector Tabs */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300">Select Platform to Configure:</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['instagram', 'facebook', 'youtube', 'threads'] as PublishingPlatformKey[]).map((p) => {
                const isSelected = platform === p;
                const status = statusList.find((s) => s.platform === p);
                const isConfigured = status?.isConfigured;

                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setPlatform(p);
                      setMessage(null);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-amber-400/10 border-amber-400/50 shadow-sm'
                        : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <SocialPlatformIcon platform={p} size="sm" />
                      <span className="text-xs font-bold text-zinc-200 capitalize">
                        {p === 'youtube' ? 'YouTube' : p}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-mono font-medium ${
                        isConfigured ? 'text-emerald-400' : 'text-zinc-500'
                      }`}
                    >
                      {isConfigured ? '● Configured' : '○ Needs Keys'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Redirect URI Info Box */}
          <div className="p-3.5 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-amber-400" />
                <span>OAuth Redirect URI (Paste in Developer Console):</span>
              </span>
              <button
                type="button"
                onClick={() => handleCopy(currentRedirectUri, 'uri')}
                className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 cursor-pointer"
              >
                {copiedKey === 'uri' ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy URI</span>
                  </>
                )}
              </button>
            </div>
            <div className="p-2.5 bg-zinc-950 rounded-lg border border-zinc-800 font-mono text-[11px] text-zinc-300 break-all select-all">
              {currentRedirectUri}
            </div>
            <p className="text-[11px] text-zinc-400">
              {platform === 'youtube' ? (
                <>Add this to <strong>Authorized redirect URIs</strong> in Google Cloud Console &gt; APIs &amp; Services &gt; Credentials.</>
              ) : (
                <>Add this to <strong>Valid OAuth Redirect URIs</strong> in Meta for Developers &gt; Facebook Login Settings.</>
              )}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSave} className="space-y-3.5">
            {!canConfigure && <p role="status" className="text-sm text-amber-300">Ask your administrator to configure this platform. You can then connect your own social account.</p>}
            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-1">
                {platform === 'youtube' ? 'Google Client ID' : 'Meta / Threads App ID'}:
              </label>
              <input disabled={!canConfigure || saving}
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={platform === 'youtube' ? 'xxx.apps.googleusercontent.com' : 'Your Meta App ID (e.g. 1234567890)'}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 font-mono focus:border-amber-400 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-1">
                {platform === 'youtube' ? 'Google Client Secret' : 'Meta / Threads App Secret'}:
              </label>
              <input disabled={!canConfigure || saving}
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Paste App Secret here..."
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 font-mono focus:border-amber-400 focus:outline-none"
                required
              />
            </div>

            <div className="pt-2 flex items-center justify-between gap-3">
              <a
                href={
                  platform === 'youtube'
                    ? 'https://console.cloud.google.com/apis/credentials'
                    : 'https://developers.facebook.com/apps'
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                <span>Open {platform === 'youtube' ? 'Google Console' : 'Meta for Developers'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                type="submit"
                disabled={saving || !canConfigure}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-zinc-950 font-bold text-xs shadow-md shadow-amber-400/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Save Credentials</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
