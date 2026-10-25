'use client';

import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Globe,
  Loader2,
  X,
  Power,
  Link as LinkIcon,
  ShieldCheck,
  Save,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Hash,
  Check,
  Copy,
  Info,
  Key,
} from 'lucide-react';
import { OAuthCredentialsModal } from '../social-publishing/OAuthCredentialsModal';
import {
  SocialAccount,
  SocialLinkPreferences,
  SocialPlatformKey,
  SavedHashtag,
} from '@/lib/social-intelligence/types';
import { SocialPlatformIcon } from './SocialPlatformIcon';
import {
  normalizeSocialUrl,
  validatePlatformUrl,
  resolveEligibleSocialLinks,
  formatSocialLinksBlock,
} from '@/lib/social-intelligence/link-engine';
import { CtaPresetsDropdown } from './CtaPresetsDropdown';
import {
  hasThreeDotsPrefix,
  toggleThreeDotsPrefix,
  applyThreeDotsPrefix,
} from '@/lib/social-intelligence/cta-presets';

export const SocialAccountsManager: React.FC = () => {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Link Preferences state (Callout heading & preview)
  const [preferences, setPreferences] = useState<SocialLinkPreferences>({
    userId: '',
    includeWebsite: true,
    includeOtherSocials: true,
    excludeTargetPlatform: true,
    customHeading: '',
    displaySeparateLines: true,
    linkOrder: ['website', 'youtube', 'instagram', 'threads', 'facebook'],
    eligibleAccountIds: [],
    fixedHashtags: [],
    updatedAt: new Date().toISOString(),
  });
  const [customHeading, setCustomHeading] = useState('');
  const [threeDotsSpacer, setThreeDotsSpacer] = useState<boolean>(true);
  const [savingHeading, setSavingHeading] = useState(false);
  const [previewPlatform, setPreviewPlatform] = useState<SocialPlatformKey>('youtube');
  const [copiedPreview, setCopiedPreview] = useState(false);

  // OAuth Publishing Connections State
  const [oauthConnections, setOauthConnections] = useState<Record<string, any>>({});
  const [oauthLoading, setOauthLoading] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configModalPlatform, setConfigModalPlatform] = useState<any>('instagram');

  const fetchOAuthConnections = async () => {
    try {
      setOauthLoading(true);
      const res = await fetch('/api/social-publishing/oauth/connections');
      const data = await res.json();
      if (data.success && data.connections) {
        const map: any = {};
        for (const c of data.connections) {
          map[c.platform] = c;
        }
        setOauthConnections(map);
      }
    } catch (e) {
      console.warn('Failed to fetch OAuth connections:', e);
    } finally {
      setOauthLoading(false);
    }
  };

  const handleConnectOAuth = async (platform: string) => {
    try {
      const res = await fetch(
        `/api/social-publishing/oauth/${platform}/connect?returnTo=/social-post?tab=accounts`,
        { headers: { Accept: 'application/json' } }
      );
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else if (data.requiresCredentials) {
        setConfigModalPlatform(platform);
        setIsConfigModalOpen(true);
      } else {
        showToast(data.error || 'Failed to initiate authorization');
      }
    } catch (e: any) {
      setConfigModalPlatform(platform);
      setIsConfigModalOpen(true);
    }
  };

  const handleDisconnectOAuth = async (platform: string) => {
    try {
      await fetch(`/api/social-publishing/oauth/${platform}/disconnect`, { method: 'POST' });
      await fetchOAuthConnections();
      showToast(`Disconnected from ${platform}`);
    } catch (e) {
      console.error('Failed to disconnect:', e);
    }
  };

  // Fixed hashtags state
  const [newTagInput, setNewTagInput] = useState('');
  const [savingHashtags, setSavingHashtags] = useState(false);
  const [copiedTagId, setCopiedTagId] = useState<string | null>(null);
  const [copiedAccountId, setCopiedAccountId] = useState<string | null>(null);

  // Drag-and-drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Modal / Form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<SocialPlatformKey>('instagram');
  const [accountUrl, setAccountUrl] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const sortAccountsByOrder = (accs: SocialAccount[], order?: string[]) => {
    if (!order || order.length === 0) return accs;
    const orderMap = new Map<string, number>();
    order.forEach((key, idx) => orderMap.set(key.toLowerCase(), idx));
    return [...accs].sort((a, b) => {
      const oA = orderMap.has(a.id.toLowerCase())
        ? orderMap.get(a.id.toLowerCase())!
        : orderMap.has(a.platform.toLowerCase())
          ? orderMap.get(a.platform.toLowerCase())!
          : 999;
      const oB = orderMap.has(b.id.toLowerCase())
        ? orderMap.get(b.id.toLowerCase())!
        : orderMap.has(b.platform.toLowerCase())
          ? orderMap.get(b.platform.toLowerCase())!
          : 999;
      return oA - oB;
    });
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      fetchOAuthConnections();
      const [accRes, prefRes] = await Promise.all([
        fetch('/api/social-accounts'),
        fetch('/api/social-accounts/preferences'),
      ]);
      const accData = await accRes.json();
      const prefData = await prefRes.json();

      let loadedAccounts: SocialAccount[] = [];
      if (accData.success) {
        loadedAccounts = accData.accounts || [];
      }

      if (prefData.success && prefData.preferences) {
        const excludeTarget = prefData.preferences.excludeTargetPlatform !== false;
        setPreferences({
          ...prefData.preferences,
          excludeTargetPlatform: excludeTarget,
        });
        const raw = prefData.preferences.customHeading || '';
        const clean = raw.replace(/^(\s*[.·•]\s*\n)+\s*/, '').trim();
        setCustomHeading(clean);
        const hasDots =
          prefData.preferences.threeDotsSpacer !== undefined
            ? prefData.preferences.threeDotsSpacer
            : true;
        setThreeDotsSpacer(hasDots);
        if (Array.isArray(prefData.preferences.linkOrder) && prefData.preferences.linkOrder.length > 0) {
          loadedAccounts = sortAccountsByOrder(loadedAccounts, prefData.preferences.linkOrder);
        }
      }
      setAccounts(loadedAccounts);
    } catch (err: any) {
      setError(err?.message || 'Failed to load social accounts');
    } finally {
      setLoading(false);
    }
  };

  const reorderAccounts = async (newAccounts: SocialAccount[]) => {
    setAccounts(newAccounts);
    const newOrder = [
      ...newAccounts.map((a) => a.id),
      ...Array.from(new Set(newAccounts.map((a) => a.platform))),
    ];
    setPreferences((prev) => ({ ...prev, linkOrder: newOrder }));

    try {
      await fetch('/api/social-accounts/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkOrder: newOrder }),
      });
      showToast('Account order rearranged! Post link priorities updated.');
    } catch {
      showToast('Error saving reordered preference');
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }

    const updated = [...accounts];
    const [moved] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, moved);
    setDraggedIndex(null);
    reorderAccounts(updated);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleMoveStep = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= accounts.length) return;
    const updated = [...accounts];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    reorderAccounts(updated);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const showToast = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  const handleOpenAdd = (defaultPlatform?: SocialPlatformKey) => {
    setEditingAccountId(null);
    setPlatform(defaultPlatform || 'instagram');
    setAccountUrl('');
    setDisplayName('');
    setIsPrimary(false);
    setFormError(null);
    setShowAddModal(true);
  };

  const handleOpenEdit = (acc: SocialAccount) => {
    setEditingAccountId(acc.id);
    setPlatform(acc.platform);
    setAccountUrl(acc.accountUrl);
    setDisplayName(acc.displayName || '');
    setIsPrimary(acc.isPrimary);
    setFormError(null);
    setShowAddModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanUrl = accountUrl.trim();
    if (!cleanUrl) {
      setFormError('Account URL or handle is required');
      return;
    }

    const validation = validatePlatformUrl(cleanUrl, platform);
    if (!validation.valid) {
      setFormError(validation.reason || 'Invalid URL for the selected platform');
      return;
    }

    // Fully canonicalize URL and check duplicates client-side
    const canonicalUrl = normalizeSocialUrl(cleanUrl, platform);
    const normalizedKey = canonicalUrl.toLowerCase();
    const isDuplicate = accounts.some(
      (a) =>
        a.id !== editingAccountId &&
        a.platform === platform &&
        normalizeSocialUrl(a.accountUrl, a.platform).toLowerCase() === normalizedKey
    );

    if (isDuplicate) {
      setFormError('This social account URL or handle is already added to your profile');
      return;
    }

    try {
      setSubmitting(true);
      if (editingAccountId) {
        // Edit existing
        const res = await fetch(`/api/social-accounts/${editingAccountId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountUrl: canonicalUrl,
            displayName,
            isPrimary,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update account');
        showToast('Social account updated successfully!');
      } else {
        // Add new
        const res = await fetch('/api/social-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform,
            accountUrl: canonicalUrl,
            displayName,
            isPrimary,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to add account');
        showToast('New social account added successfully!');
      }

      setShowAddModal(false);
      fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleEnable = async (acc: SocialAccount) => {
    try {
      const res = await fetch(`/api/social-accounts/${acc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !acc.enabled }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to toggle account');

      setAccounts((prev) =>
        prev.map((a) => (a.id === acc.id ? { ...a, enabled: !acc.enabled } : a))
      );
      showToast(`${acc.platform} ${!acc.enabled ? 'enabled' : 'disabled'}`);
    } catch (err: any) {
      setError(err.message || 'Error updating account status');
    }
  };

  const handleDelete = async (acc: SocialAccount) => {
    if (!confirm(`Are you sure you want to remove your ${acc.platform} account?`)) return;

    try {
      const res = await fetch(`/api/social-accounts/${acc.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete account');

      setAccounts((prev) => prev.filter((a) => a.id !== acc.id));
      showToast('Account removed successfully');
    } catch (err: any) {
      setError(err.message || 'Error deleting account');
    }
  };

  const handleSaveHeading = async () => {
    try {
      setSavingHeading(true);
      const cleanHeading = customHeading.replace(/^(\s*[.·•]\s*\n)+\s*/, '').trim();
      const updatedPrefs = { ...preferences, customHeading: cleanHeading, threeDotsSpacer };
      const res = await fetch('/api/social-accounts/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPrefs),
      });
      const data = await res.json();
      if (data.success && data.preferences) {
        setPreferences(data.preferences);
        showToast('Callout heading updated successfully!');
      }
    } catch {
      showToast('Error saving heading');
    } finally {
      setSavingHeading(false);
    }
  };

  const handleToggleExcludeTarget = async () => {
    const nextVal = preferences.excludeTargetPlatform === false ? true : false;
    const updated = { ...preferences, excludeTargetPlatform: nextVal };
    setPreferences(updated);
    try {
      await fetch('/api/social-accounts/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludeTargetPlatform: nextVal }),
      });
      showToast(
        nextVal
          ? 'Target platform link is now excluded'
          : 'Target platform link is now included'
      );
    } catch {
      showToast('Error updating preference');
    }
  };

  // Fixed hashtags handlers
  const handleAddHashtag = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    let clean = newTagInput.trim().toLowerCase();
    if (!clean) return;
    if (!clean.startsWith('#')) clean = `#${clean}`;
    clean = clean.replace(/\s+/g, '');

    const existingTags = preferences.fixedHashtags || [];
    if (existingTags.some((t) => t.tag.toLowerCase() === clean.toLowerCase())) {
      showToast(`Hashtag ${clean} is already added!`);
      setNewTagInput('');
      return;
    }

    const newTag: SavedHashtag = {
      id: `tag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tag: clean,
      enabled: true,
    };

    const updatedTags = [...existingTags, newTag];
    const updatedPrefs = { ...preferences, fixedHashtags: updatedTags };
    setPreferences(updatedPrefs);
    setNewTagInput('');

    try {
      await fetch('/api/social-accounts/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixedHashtags: updatedTags }),
      });
      showToast(`Added ${clean} and ticked for reels!`);
    } catch {
      showToast('Error saving hashtag');
    }
  };

  const handleToggleHashtag = async (id: string) => {
    const existingTags = preferences.fixedHashtags || [];
    const updatedTags = existingTags.map((t) =>
      t.id === id ? { ...t, enabled: !t.enabled } : t
    );
    const updatedPrefs = { ...preferences, fixedHashtags: updatedTags };
    setPreferences(updatedPrefs);

    try {
      await fetch('/api/social-accounts/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixedHashtags: updatedTags }),
      });
      const toggled = updatedTags.find((t) => t.id === id);
      showToast(`${toggled?.tag} ${toggled?.enabled ? 'ticked (added to reels)' : 'unticked'}`);
    } catch {
      showToast('Error updating hashtag');
    }
  };

  const handleDeleteHashtag = async (id: string) => {
    const existingTags = preferences.fixedHashtags || [];
    const updatedTags = existingTags.filter((t) => t.id !== id);
    const updatedPrefs = { ...preferences, fixedHashtags: updatedTags };
    setPreferences(updatedPrefs);

    try {
      await fetch('/api/social-accounts/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixedHashtags: updatedTags }),
      });
      showToast('Hashtag removed');
    } catch {
      showToast('Error removing hashtag');
    }
  };

  const handleCopyHashtag = (tag: string, id: string) => {
    const formattedTag = tag.startsWith('#') ? tag : `#${tag}`;
    navigator.clipboard.writeText(formattedTag);
    setCopiedTagId(id);
    showToast(`Copied ${formattedTag} to clipboard!`);
    setTimeout(() => setCopiedTagId(null), 2000);
  };

  const handleCopyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedAccountId(id);
    showToast('Account link copied to clipboard!');
    setTimeout(() => setCopiedAccountId(null), 2000);
  };

  const handleSaveHashtags = async () => {
    try {
      setSavingHashtags(true);
      await fetch('/api/social-accounts/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixedHashtags: preferences.fixedHashtags || [] }),
      });
      showToast('Fixed hashtags saved successfully!');
    } catch {
      showToast('Error saving hashtags');
    } finally {
      setSavingHashtags(false);
    }
  };

  // Live preview string
  const previewEligibleLinks = resolveEligibleSocialLinks(
    accounts,
    { ...preferences, customHeading, threeDotsSpacer },
    previewPlatform
  );
  let previewFormattedText = formatSocialLinksBlock(
    previewEligibleLinks,
    { ...preferences, customHeading, threeDotsSpacer }
  );

  const activeFixedTags = (preferences.fixedHashtags || [])
    .filter((h) => h.enabled)
    .map((h) => (h.tag.startsWith('#') ? h.tag : `#${h.tag}`));

  if (activeFixedTags.length > 0) {
    const tagsString = activeFixedTags.join(' ');
    if (previewFormattedText) {
      previewFormattedText = `${previewFormattedText}\n\n${tagsString}`;
    } else {
      previewFormattedText = tagsString;
    }
  }

  const handleCopyPreview = () => {
    if (!previewFormattedText) return;
    navigator.clipboard.writeText(previewFormattedText);
    setCopiedPreview(true);
    showToast('Caption preview copied to clipboard!');
    setTimeout(() => setCopiedPreview(false), 2000);
  };

  const platforms: { key: SocialPlatformKey; label: string }[] = [
    { key: 'instagram', label: 'Instagram' },
    { key: 'youtube', label: 'YouTube' },
    { key: 'facebook', label: 'Facebook' },
    { key: 'threads', label: 'Threads' },
    { key: 'website', label: 'Website / Custom URL' },
  ];

  return (
    <div className="space-y-6 w-full">
      {/* Toast notifications */}
      {successMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Connected Social Publishing Accounts (OAuth 2.0) Section */}
      <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400 flex items-center justify-center text-zinc-950 font-black shadow-md shadow-amber-400/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">
                  Connected Social Publishing Accounts (OAuth 2.0)
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
                  Direct API Publishing
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Authorize your accounts once to publish Reels and Shorts directly without manual copy-pasting.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setConfigModalPlatform('instagram');
              setIsConfigModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold border border-zinc-700 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span>Configure API Keys</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { platform: 'youtube', name: 'YouTube Shorts', desc: 'Google Data API v3' },
            { platform: 'instagram', name: 'Instagram Reels', desc: 'Meta Graph API' },
            { platform: 'facebook', name: 'Facebook Reels', desc: 'Meta Page Reels API' },
            { platform: 'threads', name: 'Threads', desc: 'Official Threads API' },
          ].map((item) => {
            const conn = oauthConnections[item.platform];
            const isConnected = Boolean(conn && conn.status === 'connected');

            return (
              <div
                key={item.platform}
                className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-3 transition-all ${
                  isConnected
                    ? 'bg-zinc-950 border-emerald-500/40 shadow-sm'
                    : 'bg-zinc-950/60 border-zinc-800/90'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <SocialPlatformIcon platform={item.platform as any} size="sm" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{item.name}</div>
                      <div className="text-[10px] text-zinc-500">{item.desc}</div>
                    </div>
                  </div>
                  {isConnected ? (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50 shrink-0" />
                  ) : null}
                </div>

                {isConnected ? (
                  <div className="space-y-2 pt-1 border-t border-zinc-800/60">
                    <div className="text-[11px] text-zinc-300 font-semibold truncate">
                      {conn.accountHandle || conn.accountName}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>Connected</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDisconnectOAuth(item.platform)}
                        className="text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConnectOAuth(item.platform)}
                    className="w-full text-center text-xs font-bold py-1.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700 transition-all cursor-pointer block"
                  >
                    Connect Account
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-amber-400" />
            Saved Social Accounts
            <span className="text-xs font-normal text-zinc-500 font-mono px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700">
              {accounts.length}
            </span>
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Connect your official profiles. The Intelligent Link Engine automatically includes appropriate links in your viral reel captions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleOpenAdd()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs shadow-md shadow-amber-400/10 transition-all cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Social Account</span>
        </button>
      </div>

      {/* Quick Add Pills */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500 font-medium">Quick Add:</span>
        {platforms.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => handleOpenAdd(p.key)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
          >
            <SocialPlatformIcon platform={p.key} className="w-3.5 h-3.5" />
            <span>{p.label}</span>
          </button>
        ))}
      </div>

      {/* Accounts List */}
      {loading ? (
        <div className="py-16 text-center space-y-2">
          <Loader2 className="w-6 h-6 text-amber-400 animate-spin mx-auto" />
          <p className="text-xs text-zinc-400">Loading social accounts...</p>
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900/40 border border-dashed border-zinc-800 rounded-2xl p-8 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-400/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-400/20">
            <Globe className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-white">No Social Accounts Saved</h4>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Add your YouTube channel, Instagram page, Threads, Facebook, or Website to enable auto-formatted bio links in generated social posts.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleOpenAdd()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 text-black font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Your First Account</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs px-1 text-zinc-400">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-300 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-md">
                <GripVertical className="w-3 h-3 text-amber-400" />
                Drag cards to reorder priority
              </span>
            </div>
            <span className="text-[11px] text-zinc-500">
              Higher cards appear first in post link sections
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {accounts.map((acc, idx) => (
              <div
                key={acc.id}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnter={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                className={`group relative p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between space-y-3 select-none ${draggedIndex === idx
                  ? 'opacity-30 scale-[0.98] border-dashed border-amber-400 bg-amber-400/5 ring-2 ring-amber-400/40 cursor-grabbing'
                  : dragOverIndex === idx
                    ? 'border-amber-400 bg-amber-400/10 shadow-lg shadow-amber-400/10 scale-[1.01] ring-2 ring-amber-400 cursor-move'
                    : acc.enabled
                      ? 'bg-zinc-900/70 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/90 cursor-grab active:cursor-grabbing'
                      : 'bg-zinc-950/40 border-zinc-900 opacity-60 cursor-grab active:cursor-grabbing'
                  }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Drag handle grip */}
                    <div
                      title="Drag to rearrange priority"
                      className="p-1 -ml-1 text-zinc-500 group-hover:text-amber-400 hover:bg-zinc-800/80 rounded transition-colors cursor-grab active:cursor-grabbing shrink-0"
                    >
                      <GripVertical className="w-4 h-4" />
                    </div>

                    <div className="w-9 h-9 rounded-xl bg-zinc-800/90 border border-zinc-700/60 flex items-center justify-center shrink-0">
                      <SocialPlatformIcon platform={acc.platform} className="w-5 h-5" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white capitalize">
                          {acc.platform}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 border border-zinc-700/60 px-1.5 py-0.2 rounded font-semibold">
                          #{idx + 1}
                        </span>
                        {acc.isPrimary && (
                          <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/30 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                            <span>Primary</span>
                          </span>
                        )}
                      </div>
                      {acc.displayName && (
                        <p className="text-[11px] text-zinc-300 font-medium truncate">
                          {acc.displayName}
                        </p>
                      )}
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-0.5 shrink-0"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {/* Step Up button */}
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={() => handleMoveStep(idx, idx - 1)}
                        title="Move priority up"
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* Step Down button */}
                    {idx < accounts.length - 1 && (
                      <button
                        type="button"
                        onClick={() => handleMoveStep(idx, idx + 1)}
                        title="Move priority down"
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleToggleEnable(acc)}
                      title={acc.enabled ? 'Click to disable' : 'Click to enable'}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${acc.enabled
                        ? 'text-emerald-400 hover:bg-emerald-500/10'
                        : 'text-zinc-600 hover:bg-zinc-800'
                        }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(acc)}
                      title="Edit account"
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(acc)}
                      title="Remove account"
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* URL & Link Preview */}
                <div
                  className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs gap-2"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <a
                    href={acc.accountUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-400 hover:text-amber-400 font-mono text-[11px] truncate flex items-center gap-1.5 transition-colors flex-1 min-w-0"
                  >
                    <span className="truncate">{acc.accountUrl}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>

                  {/* Copy Account Link Button */}
                  <button
                    type="button"
                    onClick={() => handleCopyUrl(acc.accountUrl, acc.id)}
                    title={`Copy ${acc.platform} link`}
                    className="p-1 rounded text-zinc-500 hover:text-amber-400 hover:bg-amber-400/10 transition-colors cursor-pointer shrink-0"
                  >
                    {copiedAccountId === acc.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Side-by-Side: Fixed Hashtags & Live Link Engine Preview */}
      <div className="pt-6 border-t border-zinc-800/80 grid grid-cols-1 md:grid-cols-2 gap-6 w-full items-start">
        {/* Left Column: Fixed / Brand Hashtag Manager */}
        <div className="w-full p-5 bg-gradient-to-br from-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-2xl space-y-4 shadow-xl">
          {/* Card Title Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-2 min-w-0">
              <Hash className="w-4 h-4 text-amber-400 shrink-0" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider truncate">
                My Fixed Hashtags
              </h3>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 border border-amber-400/30 px-1.5 py-0.2 rounded font-semibold">
                {(preferences.fixedHashtags || []).filter((h) => h.enabled).length} active
              </span>
              <button
                type="button"
                onClick={handleSaveHashtags}
                disabled={savingHashtags}
                className="flex items-center gap-1.5 px-3 py-1 bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs rounded-lg transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {savingHashtags ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                <span>Save Tags</span>
              </button>
            </div>
          </div>

          <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
            Add your own fixed hashtags. Tick (✓) to include them in reels.
          </p>

          {/* Quick Add Tag Form */}
          <form onSubmit={handleAddHashtag} className="flex items-center gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                <Hash className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                placeholder="Enter your hashtag..."
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-400 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-colors"
              />
            </div>
            <button
              type="submit"
              className="flex items-center gap-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs rounded-xl border border-zinc-700 transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>Add</span>
            </button>
          </form>

          {/* Hashtags Checklist */}
          <div className="space-y-2 max-h-[290px] overflow-y-auto pr-1">
            {(preferences.fixedHashtags || []).length === 0 ? (
              <div className="text-center py-6 border border-dashed border-zinc-800 rounded-xl p-4 text-xs text-zinc-500">
                No fixed hashtags yet. Enter your own hashtag above and click Add.
              </div>
            ) : (
              (preferences.fixedHashtags || []).map((ht) => (
                <div
                  key={ht.id}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${ht.enabled
                    ? 'bg-zinc-950/80 border-amber-400/30'
                    : 'bg-zinc-950/30 border-zinc-900 opacity-60'
                    }`}
                >
                  {/* Tick / Checkbox */}
                  <button
                    type="button"
                    onClick={() => handleToggleHashtag(ht.id)}
                    className="flex items-center gap-2.5 text-left flex-1 cursor-pointer group"
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${ht.enabled
                        ? 'bg-amber-400 border-amber-400 text-black'
                        : 'bg-zinc-900 border-zinc-700 text-transparent group-hover:border-zinc-500'
                        }`}
                    >
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>

                    <span className={`text-xs font-mono font-medium ${ht.enabled ? 'text-white' : 'text-zinc-400 line-through'}`}>
                      {ht.tag}
                    </span>

                    {ht.enabled ? (
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono">
                        ✓ Added to Reels
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-500 bg-zinc-900 px-1.5 py-0.2 rounded font-mono">
                        Off
                      </span>
                    )}
                  </button>

                  {/* Copy Button */}
                  <button
                    type="button"
                    onClick={() => handleCopyHashtag(ht.tag, ht.id)}
                    title={`Copy ${ht.tag}`}
                    className="p-1 rounded text-zinc-500 hover:text-amber-400 hover:bg-amber-400/10 transition-colors cursor-pointer shrink-0 ml-2"
                  >
                    {copiedTagId === ht.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={() => handleDeleteHashtag(ht.id)}
                    title={`Remove ${ht.tag}`}
                    className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0 ml-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="text-[11px] text-zinc-400 flex items-center justify-between pt-1 border-t border-zinc-800/60">
            <span>Tick (✓) checkboxes to include tags automatically in reels.</span>
          </div>
        </div>

        {/* Right Column: Live Link Engine Preview & Callout Heading */}
        <div className="w-full p-5 bg-gradient-to-br from-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-2xl space-y-4 shadow-xl">
          {/* Card Title Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-2 min-w-0">
              <LinkIcon className="w-4 h-4 text-amber-400 shrink-0" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider truncate">
                Live Link Engine Preview
              </h3>
            </div>
            <button
              type="button"
              onClick={handleSaveHeading}
              disabled={savingHeading}
              className="flex items-center gap-1.5 px-3 py-1 bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs rounded-lg transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
            >
              {savingHeading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              <span>Save Heading</span>
            </button>
          </div>

          {/* Target Platform Simulation Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>{preferences.excludeTargetPlatform !== false ? 'Simulate Target Platform:' : 'Target Platform Exclusion:'}</span>
              <button
                type="button"
                onClick={handleToggleExcludeTarget}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[10px] transition-all cursor-pointer border ${
                  preferences.excludeTargetPlatform !== false
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-zinc-200 hover:border-zinc-600'
                }`}
                title="Click to toggle: When ON, the target platform's own link is excluded from post copy. When OFF, all links are included."
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    preferences.excludeTargetPlatform !== false ? 'bg-emerald-400' : 'bg-zinc-500'
                  }`}
                />
                <span>
                  {preferences.excludeTargetPlatform !== false
                    ? 'Excludes target link: ON'
                    : 'Excludes target link: OFF'}
                </span>
              </button>
            </div>

            {/* When excludeTargetPlatform is OFF, hide platform simulation buttons */}
            {preferences.excludeTargetPlatform !== false && (
              <div className="grid grid-cols-4 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                {(['youtube', 'instagram', 'threads', 'facebook'] as SocialPlatformKey[]).map((pKey) => (
                  <button
                    key={pKey}
                    type="button"
                    onClick={() => setPreviewPlatform(pKey)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold capitalize text-center transition-all cursor-pointer ${
                      previewPlatform === pKey
                        ? 'bg-amber-400 text-black shadow-sm font-bold'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                    }`}
                  >
                    {pKey}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Heading input placed directly above the output preview box with CTA dropdown & 3-dots spacer */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-zinc-300 flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-amber-400" />
                <span>Link Section Callout Heading</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setThreeDotsSpacer((prev) => !prev)}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                    threeDotsSpacer
                      ? 'bg-amber-400/20 border-amber-400 text-amber-300 shadow-sm'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                  title="Toggle 3 dots vertical spacer (. . .) above heading for Instagram & Reels captions"
                >
                  <span className="font-mono tracking-wider font-bold">•••</span>
                  <span>3 Dots Spacer</span>
                  {threeDotsSpacer && <Check className="w-3 h-3 text-amber-400 shrink-0" />}
                </button>
                <span className="text-[11px] text-zinc-500 hidden sm:inline">(Leave blank to omit heading)</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              {/* Left Side: Single-line input with heading text only and matching height */}
              <div className="relative flex-1">
                <input
                  type="text"
                  value={customHeading}
                  onChange={(e) => {
                    const cleanText = e.target.value.replace(/^(\s*[.·•]\s*\n)+\s*/, '');
                    setCustomHeading(cleanText);
                  }}
                  placeholder="e.g. Follow for daily updates:"
                  className="w-full h-9 bg-zinc-950 border border-zinc-800 focus:border-amber-400 rounded-xl px-3.5 pr-8 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-colors"
                />
                {customHeading && (
                  <button
                    type="button"
                    onClick={() => setCustomHeading('')}
                    title="Clear heading"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Right Side: Predefined CTA & Heading Dropdown with matching h-9 height */}
              <div className="sm:w-[220px] w-full shrink-0">
                <CtaPresetsDropdown
                  currentValue={customHeading}
                  onSelect={(text) => {
                    const cleanText = text.replace(/^(\s*[.·•]\s*\n)+\s*/, '').trim();
                    setCustomHeading(cleanText);
                  }}
                  placeholder="⚡ Predefined CTAs ▾"
                />
              </div>
            </div>
          </div>

          {/* Output Preview Box */}
          <div className="p-3.5 bg-zinc-950/90 rounded-xl border border-zinc-800 text-xs font-mono space-y-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-400 pb-2 border-b border-zinc-800/80">
              <div className="flex items-center gap-2">
                <span className="capitalize">
                  Output preview {preferences.excludeTargetPlatform !== false ? (
                    <>for <strong className="text-white font-semibold">{previewPlatform}</strong>:</>
                  ) : (
                    <strong className="text-white font-semibold">(All Links)</strong>
                  )}:
                </span>
                <span className="text-[10px] text-amber-400 font-mono bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.2 rounded font-semibold">
                  {previewEligibleLinks.length} link{previewEligibleLinks.length === 1 ? '' : 's'}
                </span>
              </div>

              <button
                type="button"
                onClick={handleCopyPreview}
                disabled={!previewFormattedText}
                className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
              >
                {copiedPreview ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400 font-medium">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-amber-400" />
                    <span>Copy Snippet</span>
                  </>
                )}
              </button>
            </div>

            {previewFormattedText ? (
              <div className="text-zinc-200 whitespace-pre-wrap leading-relaxed text-xs">
                {previewFormattedText}
              </div>
            ) : (
              <div className="text-zinc-500 italic py-3 text-center text-xs">
                No active links eligible for {previewPlatform}.
              </div>
            )}
          </div>

          {/* Target platform exclusion notice - only shown when exclusion is active */}
          {preferences.excludeTargetPlatform !== false && (
            <div className="text-[11px] text-emerald-400/90 flex items-center gap-1.5 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Target {previewPlatform} link is excluded automatically from the snippet above.</span>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md p-6 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl space-y-4">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400 flex items-center justify-center">
                <SocialPlatformIcon platform={platform} className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">
                  {editingAccountId ? 'Edit Social Account' : 'Add Social Account'}
                </h4>
                <p className="text-[11px] text-zinc-400">
                  Save your official channel or page link.
                </p>
              </div>
            </div>

            {formError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Platform selector */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                  Social Platform
                </label>
                <select
                  disabled={Boolean(editingAccountId)}
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as SocialPlatformKey)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 transition-colors cursor-pointer"
                >
                  {platforms.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Account URL / Handle */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-300 mb-1 flex items-center justify-between">
                  <span>Profile URL or Handle</span>
                  <span className="text-[10px] text-zinc-500 font-normal">e.g. @reelspark or full link</span>
                </label>
                <input
                  type="text"
                  value={accountUrl}
                  onChange={(e) => setAccountUrl(e.target.value)}
                  placeholder={
                    platform === 'youtube'
                      ? 'https://youtube.com/@channel'
                      : platform === 'instagram'
                        ? 'https://instagram.com/handle'
                        : platform === 'threads'
                          ? 'https://threads.net/@handle'
                          : platform === 'facebook'
                            ? 'https://facebook.com/pagename'
                            : 'https://yourwebsite.com'
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-400 font-mono transition-colors"
                />
                {accountUrl.trim() && (
                  <p className="text-[10px] text-zinc-500 mt-1 font-mono truncate">
                    Normalized: {normalizeSocialUrl(accountUrl, platform)}
                  </p>
                )}
              </div>

              {/* Optional Display Name */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                  Display Label (Optional)
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Official Channel, Podcast Page"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-400 transition-colors"
                />
              </div>

              {/* Primary checkbox */}
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-zinc-700 text-amber-500 focus:ring-amber-400 bg-zinc-900"
                />
                <span className="text-xs text-zinc-300">
                  Designate as primary {platform} account
                </span>
              </label>

              {/* Actions */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-xl text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black font-bold rounded-xl text-xs transition-all shadow-md shadow-amber-400/10 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Developer API Keys Configuration Modal */}
      <OAuthCredentialsModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        initialPlatform={configModalPlatform}
        onSaved={() => fetchOAuthConnections()}
      />
    </div>
  );
};
