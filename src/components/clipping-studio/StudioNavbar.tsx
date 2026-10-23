'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Scissors,
  Sparkles,
  User,
  LogOut,
  ChevronDown,
  LayoutDashboard,
  Share2,
} from 'lucide-react';
import { useAuthStore } from '@/lib/use-auth-store';
import { AuthModal } from '../AuthModal';

export const StudioNavbar: React.FC = () => {
  const { user, checkAuth, logout, openAuthModal } = useAuthStore();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <>
      <header className="h-14 border-b border-zinc-800 bg-zinc-900/90 px-4 sm:px-6 flex items-center justify-between shrink-0 z-30 sticky top-0 backdrop-blur-md">
        {/* Left: Branding & 4-Pill Studio Switcher */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center text-black font-black shadow-md shadow-amber-400/20">
              <Scissors className="w-4 h-4 text-black" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                Clipping Studio
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Pro Studio
                </span>
              </span>
            </div>
          </Link>

          {/* Quick Studio Switcher */}
          <div className="hidden md:flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 ml-3 text-xs">
            <Link
              href="/"
              className="px-2.5 py-1 rounded-md text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <LayoutDashboard className="w-3 h-3" />
              <span>Dashboard</span>
            </Link>
            <Link
              href="/reel-maker"
              className="px-2.5 py-1 rounded-md text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>AI Reel Maker</span>
            </Link>
            <Link
              href="/clipping-studio"
              className="px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-300 font-semibold flex items-center gap-1.5 border border-amber-500/30"
            >
              <Scissors className="w-3 h-3 text-emerald-400" />
              <span>Clipping Studio</span>
            </Link>
            <Link
              href="/social-post"
              className="px-2.5 py-1 rounded-md text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <Share2 className="w-3 h-3 text-sky-400" />
              <span>AI Social Post</span>
            </Link>
          </div>
        </div>

        {/* Right: User Account / Profile */}
        <div className="flex items-center space-x-2">
          {user ? (
            <div className="relative pl-1">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60 hover:border-zinc-500 text-xs transition-all cursor-pointer"
              >
                <div className="w-5 h-5 rounded-full bg-amber-400 text-zinc-950 font-bold flex items-center justify-center text-[10px]">
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
                  <button
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
          ) : (
            <button
              onClick={() => openAuthModal('login')}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-white hover:bg-zinc-200 text-black font-bold text-xs transition-all cursor-pointer"
            >
              <User className="w-3.5 h-3.5 text-black" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </header>

      <AuthModal />
    </>
  );
};
