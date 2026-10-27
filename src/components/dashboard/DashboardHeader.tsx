'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Menu,
  CheckCircle2,
  AlertTriangle,
  BrainCircuit,
  Cpu,
  PlusCircle,
  ChevronDown,
  User,
  LogOut,
  Sliders,
  FolderPlus,
} from 'lucide-react';
import { useAuthStore } from '@/lib/use-auth-store';

interface DashboardHeaderProps {
  title?: string;
  subtitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
  onOpenMobileSidebar: () => void;
  systemStatus?: {
    ffmpeg: { available: boolean; version?: string };
    ollama?: { configured: boolean; model: string };
    gemini?: { configured: boolean; model: string };
    provider?: 'ollama-cloud' | 'gemini';
  } | null;
  onNewProject?: () => void;
  onOpenSettings?: () => void;
  actions?: React.ReactNode;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  onOpenMobileSidebar,
  systemStatus,
  onNewProject,
  onOpenSettings,
  actions,
}) => {
  const { user, logout } = useAuthStore();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const isGemini = systemStatus?.provider === 'gemini';
  const activeModel = isGemini
    ? systemStatus?.gemini?.model || 'gemini-2.5-flash'
    : systemStatus?.ollama?.model || 'gemma4';

  return (
    <header className="h-14 border-b border-zinc-800 bg-zinc-900/90 px-4 sm:px-6 flex items-center justify-between shrink-0 z-20 sticky top-0 backdrop-blur-md">
      {/* Left: Mobile Menu Trigger + Breadcrumb / Title */}
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          title="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Title & Breadcrumbs */}
        <div className="flex flex-col">
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.label}>
                  {idx > 0 && <span className="text-zinc-600">/</span>}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="hover:text-amber-400 transition-colors"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-white font-semibold">{crumb.label}</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white tracking-tight">
                {title || 'Dashboard'}
              </h1>
              {subtitle && (
                <span className="hidden sm:inline text-xs text-zinc-400 font-normal">
                  — {subtitle}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: Contextual Badges, Actions & User Account */}
      <div className="flex items-center gap-2.5">
        {/* Custom page-specific actions passed from caller */}
        {actions}

        {/* FFmpeg Engine Status */}
        {systemStatus?.ffmpeg && (
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-[11px]">
            <span className="text-zinc-400 font-medium">FFmpeg:</span>
            {systemStatus.ffmpeg.available ? (
              <span
                className="flex items-center gap-1 text-emerald-400 font-semibold"
                title={systemStatus.ffmpeg.version}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>Ready</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-400 font-semibold">
                <AlertTriangle className="w-3 h-3" />
                <span>Checking...</span>
              </span>
            )}
          </div>
        )}

        {/* AI Engine Badge */}
        {systemStatus && onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            title={
              isGemini
                ? 'Google Gemini AI (BYOK User Key). Click to configure.'
                : 'Ollama Cloud starter model. Click to configure.'
            }
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 hover:border-amber-400/40 text-xs transition-all cursor-pointer group shadow-sm"
          >
            {isGemini ? (
              <BrainCircuit className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform shrink-0" />
            ) : (
              <Cpu className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
            )}
            <span className="font-semibold text-zinc-200">
              {isGemini ? 'Gemini' : 'Ollama Cloud'}:
            </span>
            <span className="text-zinc-400 font-mono text-[11px] truncate max-w-[100px]">
              {activeModel}
            </span>
          </button>
        )}

        {/* New Project Action */}
        {onNewProject && (
          <button
            type="button"
            onClick={onNewProject}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold transition-all shadow-md shadow-amber-400/10 cursor-pointer active:scale-95"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Project</span>
          </button>
        )}

        {/* User Account / Profile Dropdown */}
        {user && (
          <div className="relative pl-1 border-l border-zinc-800">
            <button
              type="button"
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60 hover:border-zinc-500 text-xs transition-all cursor-pointer"
            >
              <div className="w-5 h-5 rounded-full bg-amber-400 text-black font-extrabold flex items-center justify-center text-[10px]">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>

            {userDropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-52 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl p-2 z-50 text-xs animate-in fade-in"
                onMouseLeave={() => setUserDropdownOpen(false)}
              >
                <div className="px-3 py-2 border-b border-zinc-800 mb-1">
                  <p className="font-bold text-white truncate">{user.name}</p>
                  <p className="text-[11px] text-zinc-400 truncate">{user.email}</p>
                </div>

                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSettings();
                      setUserDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-zinc-300 hover:text-white hover:bg-zinc-800/60 rounded-lg transition-colors cursor-pointer text-left"
                  >
                    <Sliders className="w-3.5 h-3.5 text-zinc-400" />
                    <span>AI Engine Settings</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    logout();
                    setUserDropdownOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer text-left font-medium"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
