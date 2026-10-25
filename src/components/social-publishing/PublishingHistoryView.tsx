'use client';

import React, { useState, useEffect } from 'react';
import {
  ExternalLink,
  RotateCw,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Film,
  Calendar,
  Layers,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { SocialPublishingJob, PublishingPlatformKey } from '@/lib/social-intelligence/publishing-types';
import { SocialPlatformIcon } from '@/components/social-intelligence/SocialPlatformIcon';

export const PublishingHistoryView: React.FC = () => {
  const [history, setHistory] = useState<SocialPublishingJob[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (platformFilter !== 'all') params.set('platform', platformFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/social-publishing/history?${params.toString()}`);
      const data = await res.json();
      if (data.success && data.history) {
        setHistory(data.history);
      }
    } catch (e) {
      console.error('Failed to fetch publishing history:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [platformFilter, statusFilter]);

  const handleRetry = async (recordId: string) => {
    setRetryingId(recordId);
    try {
      await fetch(`/api/social-publishing/jobs/${recordId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId }),
      });
      await fetchHistory();
    } catch (e) {
      console.error('Failed to retry:', e);
    } finally {
      setRetryingId(null);
    }
  };

  const filteredHistory = history.filter((job) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const titleMatch = job.videoMetadata?.title?.toLowerCase().includes(q);
    const captionMatch = job.platforms.some((p) => p.postCaption.toLowerCase().includes(q));
    return titleMatch || captionMatch;
  });

  return (
    <div className="space-y-4">
      {/* Filters & Search Toolbar */}
      <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search published posts..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Platform Filter */}
          <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1">
            <span className="text-[11px] text-zinc-500 font-medium">Platform:</span>
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="all">All Platforms</option>
              <option value="youtube">YouTube Shorts</option>
              <option value="instagram">Instagram Reels</option>
              <option value="facebook">Facebook Reels</option>
              <option value="threads">Threads</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1">
            <span className="text-[11px] text-zinc-500 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="partial">Partial</option>
              <option value="in_progress">In Progress</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        {/* Refresh button */}
        <button
          type="button"
          onClick={fetchHistory}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* History Feed List */}
      {loading ? (
        <div className="p-16 flex flex-col items-center justify-center text-center space-y-3">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
          <p className="text-xs text-zinc-400">Loading publishing history...</p>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="p-16 rounded-2xl bg-zinc-900/40 border border-zinc-800 text-center space-y-3">
          <Film className="w-10 h-10 text-zinc-600 mx-auto" />
          <h3 className="text-sm font-bold text-zinc-200">No publishing history found</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Videos you publish to Instagram Reels, Facebook Reels, YouTube Shorts, or Threads will be logged here with direct post links.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredHistory.map((job) => (
            <div
              key={job.id}
              className="p-4 sm:p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700/80 transition-all shadow-md space-y-3"
            >
              {/* Job Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-zinc-800/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-amber-400 shrink-0">
                    <Film className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-zinc-100">
                      {job.videoMetadata?.title || 'Published Reel'}
                    </h4>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(job.createdAt).toLocaleString()}</span>
                      <span>·</span>
                      <span>{Math.round(job.videoMetadata?.durationSeconds || 0)}s</span>
                    </div>
                  </div>
                </div>

                {/* Overall status badge */}
                <span
                  className={`text-[10px] font-mono px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                    job.status === 'completed'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : job.status === 'failed'
                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      : job.status === 'partial'
                      ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                      : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  {job.status.replace('_', ' ')}
                </span>
              </div>

              {/* Target Platforms Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
                {job.platforms.map((record) => (
                  <div
                    key={record.id}
                    className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <SocialPlatformIcon platform={record.platform} size="sm" />
                      <div>
                        <div className="font-bold text-zinc-200 capitalize">
                          {record.platform === 'youtube'
                            ? 'YouTube Shorts'
                            : record.platform === 'instagram'
                            ? 'Instagram Reels'
                            : record.platform === 'facebook'
                            ? 'Facebook Reels'
                            : 'Threads'}
                        </div>
                        <div className="text-[10px]">
                          {record.status === 'published' && (
                            <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>Published</span>
                            </span>
                          )}
                          {record.status === 'failed' && (
                            <span className="text-rose-400 flex items-center gap-1 font-semibold truncate max-w-[120px]" title={record.errorMessage}>
                              <XCircle className="w-2.5 h-2.5 shrink-0" />
                              <span>Failed</span>
                            </span>
                          )}
                          {record.status === 'uploading' && (
                            <span className="text-amber-400 flex items-center gap-1 font-semibold">
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              <span>Uploading...</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {record.status === 'published' && record.platformPostUrl && (
                        <a
                          href={record.platformPostUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white transition-colors"
                          title="Open Published Post"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {record.status === 'failed' && (
                        <button
                          type="button"
                          onClick={() => handleRetry(record.id)}
                          disabled={retryingId === record.id}
                          className="px-2 py-1 rounded-lg bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
                        >
                          <RotateCw className={`w-3 h-3 ${retryingId === record.id ? 'animate-spin' : ''}`} />
                          <span>Retry</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
