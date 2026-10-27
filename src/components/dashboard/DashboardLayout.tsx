'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Menu } from 'lucide-react';
import { DashboardSidebar } from './DashboardSidebar';
import { ReelSparkLogo } from '../ReelSparkLogo';
import { OllamaModelModal } from '../OllamaModelModal';
import { KeyboardShortcutsDialog } from '../caption-maker/KeyboardShortcutsDialog';

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
  onNewProject?: () => void;
  headerActions?: React.ReactNode;
  contentFullWidth?: boolean;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  title,
  subtitle,
  breadcrumbs,
  onNewProject,
  headerActions,
  contentFullWidth = false,
}) => {
  // Sidebar Collapsed State (persisted in localStorage, hydrated safely after mount)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  // Sync persisted collapse state safely on client after initial hydration
  useEffect(() => {
    try {
      const stored = localStorage.getItem('reelspark_sidebar_collapsed');
      if (stored === 'true') {
        setIsCollapsed(true);
      }
    } catch {}
  }, []);

  // System Status & Modals
  const [, setSystemStatus] = useState<any>(null);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [currentModel, setCurrentModel] = useState<string>('llama3.2');

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('reelspark_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  }, []);

  // Fetch system status (FFmpeg & Ollama/Gemini)
  const fetchSystemStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/system');
      const data = await res.json();
      if (data.status === 'ok') {
        setSystemStatus(data);
        const model = data.provider === 'gemini' ? data.gemini?.model : data.ollama?.model;
        if (model) setCurrentModel(model);
      }
    } catch (err) {
      console.warn('System status check skipped:', err);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch('/api/system')
      .then((res) => res.json())
      .then((data) => {
        if (mounted && data.status === 'ok') {
          setSystemStatus(data);
          const model = data.provider === 'gemini' ? data.gemini?.model : data.ollama?.model;
          if (model) setCurrentModel(model);
        }
      })
      .catch((err) => console.warn('System status check skipped:', err));

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans selection:bg-amber-400 selection:text-black">
      {/* 1. Left Sidebar Navigation */}
      <DashboardSidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onOpenSettings={() => setShowSettingsModal(true)}
        onOpenHelp={() => setShowHelpModal(true)}
      />

      {/* 2. Main Application Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Mobile Header (Only visible on mobile screens to toggle drawer) */}
        <div className="md:hidden h-12 border-b border-zinc-800 bg-zinc-900/90 px-4 flex items-center justify-between shrink-0 z-20 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <ReelSparkLogo variant="full" className="h-5 w-auto" />
          <div className="w-7" />
        </div>

        {/* Dynamic Content Workspace */}
        <main
          className={`flex-1 overflow-y-auto min-h-0 [scrollbar-width:thin] ${
            contentFullWidth ? 'p-0' : 'p-4 sm:p-6 lg:p-8'
          }`}
        >
          {children}
        </main>
      </div>

      {/* 3. Settings Modal (Ollama & Gemini BYOK) */}
      <OllamaModelModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        currentModel={currentModel}
        onModelSaved={(model) => {
          setCurrentModel(model);
          fetchSystemStatus();
        }}
      />

      {/* 4. Help & Keyboard Shortcuts Modal */}
      <KeyboardShortcutsDialog
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
      />
    </div>
  );
};
