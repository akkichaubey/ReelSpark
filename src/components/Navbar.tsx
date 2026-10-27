'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Film,
  BrainCircuit,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  PlusCircle,
  ChevronDown,
  Share2,
  User,
  LogOut,
  Scissors,
  Cpu,
  LayoutDashboard,
} from 'lucide-react';
import { useAuthStore } from '@/lib/use-auth-store';
import { AuthModal } from './AuthModal';
import { ReelSparkLogo } from './ReelSparkLogo';

interface NavbarProps {
  systemStatus: {
    ffmpeg: { available: boolean; version?: string };
    ollama?: { configured: boolean; model: string };
    gemini?: { configured: boolean; model: string };
    provider?: 'ollama-cloud' | 'gemini';
  } | null;
  onNewProject: () => void;
  onRefreshSystem: () => void;
  onOpenOllamaModal?: () => void;
  onOpenGeminiModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  systemStatus,
  onNewProject,
  onRefreshSystem,
  onOpenOllamaModal,
  onOpenGeminiModal,
}) => {
  const pathname = usePathname();
  const isCaptionMaker = pathname === '/reel-maker' || pathname === '/caption-maker';
  const isSocialPost = pathname === '/social-post';
  const isClippingStudio = pathname === '/clipping-studio';
  const isDashboard = pathname === '/' || (!isCaptionMaker && !isSocialPost && !isClippingStudio);

  const { user, checkAuth, logout, openAuthModal } = useAuthStore();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const isPublicHome = pathname === '/' && !user;

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <>
    <header className={`h-18 px-4 sm:px-6 flex items-center justify-between shrink-0 z-30 ${
      isPublicHome ? 'fixed inset-x-0 top-0' : 'sticky top-0'
    } ${
      isPublicHome ? 'border-b border-transparent bg-transparent' : 'border-b border-zinc-800 bg-zinc-900/90 backdrop-blur-md'
    }`}>
      <div className={isPublicHome ? 'mx-auto flex w-full max-w-6xl items-center justify-between' : 'flex w-full items-center justify-between'}>
      {/* Brand & Studio Navigation */}
      <div className="flex items-center gap-3">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center hover:opacity-90 transition-opacity" title="ReelMaker">
          <ReelSparkLogo variant="full" className="h-9 w-auto shrink-0" />
        </Link>

        {/* Studio Switcher — only shown when logged in */}
        {user && (
          <div className="hidden md:flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 ml-2 text-xs">
            <Link
              href="/"
              className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-all ${
                isDashboard
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-3 h-3" />
              <span>Dashboard</span>
            </Link>
            <Link
              href="/reel-maker"
              className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-all ${
                isCaptionMaker
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Film className="w-3 h-3 text-amber-400" />
              <span>AI Reel Maker</span>
            </Link>
            <Link
              href="/clipping-studio"
              className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-all ${
                isClippingStudio
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Scissors className="w-3 h-3 text-emerald-400" />
              <span>Clipping Studio</span>
            </Link>
            <Link
              href="/social-post"
              className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-all ${
                isSocialPost
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Share2 className="w-3 h-3 text-sky-400" />
              <span>AI Social Post</span>
            </Link>
          </div>
        )}
      </div>

      {/* System Status Indicators & Actions */}
      <div className="flex items-center gap-2.5">
        {user ? (
          <>
            {/* FFmpeg Indicator */}
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-[11px]">
              <span className="text-zinc-400 font-medium">FFmpeg:</span>
              {systemStatus?.ffmpeg.available ? (
                <span className="flex items-center gap-1 text-emerald-400 font-semibold" title={systemStatus.ffmpeg.version}>
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Ready (v9.0)</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-400 font-semibold">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Checking...</span>
                </span>
              )}
            </div>

            {/* AI Engine & Model Selector Indicator */}
            {(() => {
              const isGemini = systemStatus?.provider === 'gemini';
              const aiLabel = isGemini ? 'Gemini' : 'Ollama Cloud';
              const activeModel = isGemini
                ? (systemStatus?.gemini?.model || 'gemini-2.5-flash')
                : (systemStatus?.ollama?.model || 'gemma4');

              return (
                <button
                  type="button"
                  onClick={onOpenOllamaModal || onOpenGeminiModal}
                  title={isGemini ? "Google Gemini AI (User's Personal Key). Click to change key or model." : 'Ollama Cloud starter model. Click to configure the provider.'}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 hover:border-amber-400/40 text-xs transition-all group cursor-pointer shadow-sm"
                >
                  {isGemini ? (
                    <BrainCircuit className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform flex-shrink-0" />
                  ) : (
                    <Cpu className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform flex-shrink-0" />
                  )}
                  <span className="text-zinc-400 font-medium hidden sm:inline text-[11px]">
                    {aiLabel}:
                  </span>
                  <span className="text-white font-semibold text-xs flex items-center gap-1">
                    <span>{activeModel}</span>
                    <ChevronDown className="w-3 h-3 text-zinc-400 group-hover:text-white transition-colors" />
                  </span>
                </button>
              );
            })()}

            {/* Refresh System button */}
            <button
              onClick={onRefreshSystem}
              title="Refresh System Status"
              className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            {/* User Account / Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60 hover:border-zinc-500 text-xs transition-all cursor-pointer"
              >
                <div className="w-5 h-5 rounded-full bg-amber-400 text-zinc-950 font-bold flex items-center justify-center text-[10px]">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-white font-medium max-w-[85px] truncate hidden sm:inline text-xs">
                  {user.name}
                </span>
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
                  <button
                    onClick={() => {
                      logout();
                      setUserDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>

            {/* New Project Button */}
            <button
              onClick={onNewProject}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs shadow-md shadow-amber-400/10 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Project</span>
            </button>
          </>
        ) : (
          /* When NOT logged in: Keep only Login / Register button on top right */
          <button
            onClick={() => openAuthModal('login')}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-sm shadow-md shadow-amber-400/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <User className="w-3.5 h-3.5 text-zinc-950" />
            <span>Login / Register</span>
          </button>
        )}
      </div>

      </div>
    </header>
    <AuthModal />
    </>
  );
};
