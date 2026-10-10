'use strict';
'use client';

import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface KeyboardShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsDialog: React.FC<KeyboardShortcutsDialogProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Space', desc: 'Toggle Audio Play / Pause' },
    { key: '← / →', desc: 'Seek 1 second Backward / Forward' },
    { key: 'R', desc: 'Open Render & Export Dialog' },
    { key: 'Ctrl + S / ⌘ + S', desc: 'Save Project to Local Storage' },
    { key: 'Ctrl + Z / ⌘ + Z', desc: 'Undo Recent Change' },
    { key: 'Ctrl + Shift + Z / ⌘ + ⇧ + Z', desc: 'Redo Change' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-4 bg-zinc-950/80 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-amber-400" />
            <h3 className="font-semibold text-zinc-100 text-sm">
              Keyboard Shortcuts
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {shortcuts.map((sc, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2 border-b border-zinc-800/60 last:border-0 text-xs"
            >
              <span className="text-zinc-300">{sc.desc}</span>
              <kbd className="px-2.5 py-1 bg-zinc-950 border border-zinc-800 rounded-md font-mono text-[11px] text-amber-300 font-semibold shadow-inner">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="p-3 bg-zinc-950/70 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
