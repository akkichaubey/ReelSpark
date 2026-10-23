'use client';

import React, { useState, useEffect } from 'react';
import {
  Save,
  ShieldCheck,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Loader2,
  HelpCircle,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { SocialLinkPreferences, SocialAccount, SocialPlatformKey } from '@/lib/social-intelligence/types';
import { SocialPlatformIcon } from './SocialPlatformIcon';
import { formatSocialLinksBlock, resolveEligibleSocialLinks } from '@/lib/social-intelligence/link-engine';

interface LinkPreferencesPanelProps {
  onSaved?: (prefs: SocialLinkPreferences) => void;
}

export const LinkPreferencesPanel: React.FC<LinkPreferencesPanelProps> = ({ onSaved }) => {
  const [preferences, setPreferences] = useState<SocialLinkPreferences>({
    userId: '',
    includeWebsite: true,
    includeOtherSocials: true,
    excludeTargetPlatform: true,
    customHeading: 'Connect with me:',
    displaySeparateLines: true,
    linkOrder: ['website', 'youtube', 'instagram', 'threads', 'facebook'],
    eligibleAccountIds: [],
    updatedAt: new Date().toISOString(),
  });

  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Preview target platform
  const [previewPlatform, setPreviewPlatform] = useState<SocialPlatformKey>('youtube');

  // Load accounts and preferences
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [accRes, prefRes] = await Promise.all([
          fetch('/api/social-accounts'),
          fetch('/api/social-accounts/preferences'),
        ]);

        const accData = await accRes.json();
        const prefData = await prefRes.json();

        if (accData.success) {
          setAccounts(accData.accounts || []);
        }

        if (prefData.success && prefData.preferences) {
          setPreferences(prefData.preferences);
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'Failed to load link preferences');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const showToast = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setErrorMessage(null);

      const res = await fetch('/api/social-accounts/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save preferences');
      }

      setPreferences(data.preferences);
      showToast('Link preferences updated successfully!');
      if (onSaved) onSaved(data.preferences);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error updating preferences');
    } finally {
      setSaving(false);
    }
  };

  // Toggle account eligibility
  const toggleAccountEligibility = (accountId: string) => {
    const currentEligible = preferences.eligibleAccountIds || [];
    let updated: string[];

    if (currentEligible.length === 0) {
      // If empty array, it means all enabled accounts were eligible by default.
      // Deselecting this account means all other accounts EXCEPT this one are eligible.
      updated = accounts.filter((a) => a.id !== accountId).map((a) => a.id);
    } else if (currentEligible.includes(accountId)) {
      updated = currentEligible.filter((id) => id !== accountId);
    } else {
      updated = [...currentEligible, accountId];
    }

    setPreferences({ ...preferences, eligibleAccountIds: updated });
  };

  const isAccountEligible = (accountId: string) => {
    if (!preferences.eligibleAccountIds || preferences.eligibleAccountIds.length === 0) {
      return true; // Default all enabled are eligible
    }
    return preferences.eligibleAccountIds.includes(accountId);
  };

  // Generate real-time live preview string
  const previewEligibleLinks = resolveEligibleSocialLinks(accounts, preferences, previewPlatform);
  const previewFormattedText = formatSocialLinksBlock(previewEligibleLinks, preferences);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-3" />
        <p className="text-sm">Loading Link Engine preferences...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Notifications */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-purple-400" />
            Intelligent Link Engine Preferences
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Configure how social links and websites are filtered, formatted, and inserted into generated captions.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl font-medium text-sm transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>Save Preferences</span>
        </button>
      </div>

      {successMessage && (
        <div className="flex items-center gap-2.5 p-3.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2.5 p-3.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Callout Heading & Account Selection */}
        <div className="lg:col-span-7 space-y-6">
          {/* Heading Formatting */}
          <div className="p-5 bg-zinc-900/70 border border-zinc-800/80 rounded-2xl space-y-3">
            <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
              Link Section Callout Heading
            </h3>
            <p className="text-xs text-zinc-400">
              The heading displayed directly before your social links in generated posts. Leave blank to omit heading.
            </p>
            <input
              type="text"
              value={preferences.customHeading}
              onChange={(e) => setPreferences({ ...preferences, customHeading: e.target.value })}
              placeholder="e.g. Connect with me: or Visit my links:"
              className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Account Eligibility & Multi-Account Selection */}
          <div className="p-5 bg-zinc-900/70 border border-zinc-800/80 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
                Eligible Accounts Selection
              </h3>
              <span className="text-xs text-zinc-400">
                {accounts.filter((a) => isAccountEligible(a.id)).length} of {accounts.length} enabled
              </span>
            </div>

            {accounts.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">
                No social accounts configured yet. Add accounts in the &quot;Social Accounts&quot; tab.
              </p>
            ) : (
              <div className="space-y-2">
                {accounts.map((acc) => {
                  const eligible = isAccountEligible(acc.id);
                  return (
                    <div
                      key={acc.id}
                      onClick={() => toggleAccountEligibility(acc.id)}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                        eligible
                          ? 'bg-zinc-800/60 border-purple-500/40 text-zinc-200'
                          : 'bg-zinc-900/40 border-zinc-800 text-zinc-500 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <SocialPlatformIcon platform={acc.platform} size="sm" />
                        <div className="truncate text-xs">
                          <span className="font-semibold text-zinc-200 capitalize">
                            {acc.platform}:{' '}
                          </span>
                          <span className="text-zinc-400 truncate">{acc.displayName || acc.accountUrl}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {acc.isPrimary && (
                          <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">
                            Primary
                          </span>
                        )}
                        <input
                          type="checkbox"
                          checked={eligible}
                          onChange={() => {}} // handled by parent onClick
                          className="w-4 h-4 rounded border-zinc-700 text-purple-600 focus:ring-purple-500 pointer-events-none"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Link Engine Preview */}
        <div className="lg:col-span-5 space-y-6">
          {/* Live Preview Engine */}
          <div className="p-5 bg-gradient-to-br from-zinc-900/90 to-purple-950/20 border border-purple-500/20 rounded-2xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-purple-300 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Live Link Engine Preview
              </h3>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Simulate Target Platform:</label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['youtube', 'instagram', 'threads', 'facebook'] as SocialPlatformKey[]).map((pKey) => (
                  <button
                    key={pKey}
                    type="button"
                    onClick={() => setPreviewPlatform(pKey)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                      previewPlatform === pKey
                        ? 'bg-purple-600 text-white shadow'
                        : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {pKey}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3.5 bg-zinc-950/80 rounded-xl border border-zinc-800 text-xs font-mono space-y-2">
              <div className="flex items-center justify-between text-[11px] text-zinc-500 pb-2 border-b border-zinc-800/80">
                <span>Output preview for {previewPlatform}:</span>
                <span className="text-purple-400">{previewEligibleLinks.length} link(s) included</span>
              </div>

              {previewFormattedText ? (
                <div className="text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {previewFormattedText}
                </div>
              ) : (
                <div className="text-zinc-500 italic py-2 text-center">
                  No links eligible for this target platform based on current preferences.
                </div>
              )}
            </div>

            {preferences.excludeTargetPlatform && (
              <div className="text-[11px] text-emerald-400/90 flex items-center gap-1.5 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Target {previewPlatform} link is excluded automatically from the snippet above.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
