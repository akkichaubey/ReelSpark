'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Film,
  LayoutDashboard,
  Scissors,
  Sparkles,
  Share2,
  Download,
  Sliders,
  HelpCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  X,
  Users,
  BookOpen,
} from 'lucide-react';
import { useAuthStore } from '@/lib/use-auth-store';
import { ReelSparkLogo } from '@/components/ReelSparkLogo';

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  isExternal?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface DashboardSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenSettings?: () => void;
  onOpenHelp?: () => void;
}

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  onOpenSettings,
  onOpenHelp,
}) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentView = searchParams.get('view');
  const { user, logout } = useAuthStore();

  // Navigation structure mapped directly to working ReelSpark features
  const navSections: NavSection[] = [
    {
      title: 'Workspace',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          href: '/',
          icon: LayoutDashboard,
        },
        {
          id: 'clip-finder',
          label: 'Clip Finder',
          href: '/?view=clip-finder',
          icon: Film,
        },
        {
          id: 'clipping-studio',
          label: 'Video & Audio Studio',
          href: '/clipping-studio',
          icon: Scissors,
        },
        {
          id: 'export-history',
          label: 'Export History',
          href: '/clipping-studio?tab=export',
          icon: Download,
        },
      ],
    },
    {
      title: 'Social Intelligence',
      items: [
        {
          id: 'social-post',
          label: 'AI Social Post',
          href: '/social-post',
          icon: Share2,
        },
        {
          id: 'social-accounts',
          label: 'Social Accounts',
          href: '/social-post?tab=accounts',
          icon: Users,
        },
        {
          id: 'social-guidelines',
          label: 'Platform Specs',
          href: '/social-post?tab=guidelines',
          icon: BookOpen,
        },
      ],
    },
  ];

  // Helper to check if item is currently active
  const isItemActive = (item: NavItem) => {
    if (item.href === '/') {
      return pathname === '/' && currentView !== 'clip-finder';
    }
    if (item.href === '/?view=clip-finder') {
      return pathname === '/' && currentView === 'clip-finder';
    }
    if (item.href === '/clipping-studio?tab=export') {
      return pathname === '/clipping-studio' && searchParams.get('tab') === 'export';
    }
    if (item.href === '/clipping-studio') {
      return pathname === '/clipping-studio' && searchParams.get('tab') !== 'export';
    }
    if (item.href === '/caption-maker') {
      return pathname.startsWith('/caption-maker');
    }
    if (item.href.startsWith('/social-post')) {
      if (!pathname.startsWith('/social-post')) return false;
      const currentTab = searchParams.get('tab') || 'generator';
      if (item.href === '/social-post' || item.href === '/social-post?tab=generator') {
        return currentTab === 'generator' || !searchParams.get('tab');
      }
      if (item.href === '/social-post?tab=accounts' || item.href === '/social-post?tab=preferences') {
        return currentTab === 'accounts';
      }
      if (item.href === '/social-post?tab=guidelines') {
        return currentTab === 'guidelines';
      }
      return false;
    }
    return pathname === item.href;
  };

  const sidebarContent = (
    <div className="flex flex-col h-full select-none overflow-hidden">
      {/* Brand Header */}
      <div
        className={`h-16 flex items-center border-b border-zinc-800 shrink-0 transition-all overflow-hidden ${
          isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
        }`}
      >
        <Link
          href="/"
          onClick={onCloseMobile}
          className="flex items-center gap-2.5 group"
          title="ReelSpark Studio"
        >
          {isCollapsed ? (
            <ReelSparkLogo
              variant="icon"
              className="w-8 h-8 group-hover:scale-105 transition-transform shrink-0"
            />
          ) : (
            <ReelSparkLogo
              variant="full"
              className="h-7 w-auto group-hover:scale-[1.02] transition-transform shrink-0"
            />
          )}
        </Link>

        {/* Desktop Collapse Toggle */}
        {!isCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Collapse sidebar (Rail mode)"
            className="hidden lg:flex p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <div className={`flex-1 py-4 space-y-6 [scrollbar-width:thin] ${isCollapsed ? 'overflow-hidden px-2' : 'overflow-y-auto px-3'}`}>
        {navSections.map((section) => (
          <div key={section.title} className="space-y-1">
            {!isCollapsed ? (
              <h3 className="px-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                {section.title}
              </h3>
            ) : (
              <div className="h-2" />
            )}

            <div className="space-y-1">
              {section.items.map((item) => {
                const active = isItemActive(item);
                const IconComponent = item.icon;

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={onCloseMobile}
                    title={isCollapsed ? item.label : undefined}
                    className={`group relative flex items-center rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isCollapsed
                        ? 'justify-center p-2.5'
                        : 'px-3 py-2.5 gap-3'
                    } ${
                      active
                        ? 'bg-amber-400 text-black shadow-md shadow-amber-400/10 font-bold'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                    }`}
                  >
                    <IconComponent
                      className={`w-4 h-4 shrink-0 transition-transform ${
                        active ? 'text-black' : 'text-zinc-400 group-hover:text-zinc-200'
                      }`}
                    />

                    {!isCollapsed && (
                      <span className="flex-1 truncate">{item.label}</span>
                    )}

                    {!isCollapsed && item.badge && (
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                          active
                            ? 'bg-black/20 text-black'
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}

                    {/* Collapsed Tooltip on Hover */}
                    {isCollapsed && (
                      <div className="absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-xs font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 shadow-xl shadow-black/80">
                        {item.label}
                        {item.badge && (
                          <span className="ml-1.5 text-[9px] font-mono text-amber-400">
                            [{item.badge}]
                          </span>
                        )}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Secondary Bottom Actions: Settings, Help & User Profile */}
      <div className={`border-t border-zinc-800 space-y-2 shrink-0 bg-zinc-950/40 ${isCollapsed ? 'p-2' : 'p-3'}`}>
        {/* Expand Sidebar button when collapsed */}
        {isCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expand sidebar"
            className="hidden lg:flex w-full items-center justify-center p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* AI Engine & Settings */}
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            title={isCollapsed ? 'AI Engine Settings (Ollama & Gemini)' : undefined}
            className={`w-full flex items-center rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer ${
              isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 gap-3'
            }`}
          >
            <Sliders className="w-4 h-4 shrink-0 text-zinc-400" />
            {!isCollapsed && <span className="truncate">AI Engine & Settings</span>}
          </button>
        )}

        {/* Help & Keyboard Shortcuts */}
        {onOpenHelp && (
          <button
            type="button"
            onClick={onOpenHelp}
            title={isCollapsed ? 'Help & Shortcuts' : undefined}
            className={`w-full flex items-center rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer ${
              isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 gap-3'
            }`}
          >
            <HelpCircle className="w-4 h-4 shrink-0 text-zinc-400" />
            {!isCollapsed && <span className="truncate">Help & Shortcuts</span>}
          </button>
        )}

        {/* User Account / Profile & Sign Out */}
        {user ? (
          <div
            className={`flex items-center rounded-xl bg-zinc-900/90 border border-zinc-800/80 transition-all ${
              isCollapsed ? 'p-1.5 justify-center' : 'p-2 justify-between'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <div className="w-7 h-7 rounded-lg bg-amber-400 text-black font-extrabold flex items-center justify-center text-xs shrink-0 shadow-sm shadow-amber-400/20">
                {user.name.charAt(0).toUpperCase()}
              </div>
              {!isCollapsed && (
                <div className="flex flex-col truncate">
                  <span className="text-xs font-bold text-white truncate">{user.name}</span>
                  <span className="text-[10px] text-zinc-400 truncate">{user.email}</span>
                </div>
              )}
            </div>

            {!isCollapsed && (
              <button
                type="button"
                onClick={() => logout()}
                title="Sign Out"
                className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Persistent) */}
      <aside
        suppressHydrationWarning
        className={`hidden md:flex flex-col border-r border-zinc-800 bg-zinc-950 shrink-0 transition-all duration-200 z-30 overflow-hidden ${
          isCollapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer (Slide-out Overlay) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity animate-in fade-in"
          />

          {/* Drawer Container */}
          <div className="relative w-72 max-w-[85vw] bg-zinc-950 border-r border-zinc-800 h-full flex flex-col z-50 animate-in slide-in-from-left duration-200 shadow-2xl">
            {/* Close Button */}
            <div className="absolute top-4 right-4 z-10">
              <button
                type="button"
                onClick={onCloseMobile}
                className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
