'use client';

import React from 'react';
import { Trash2, Film, ImageIcon, Music, AlertTriangle, Loader2, X } from 'lucide-react';
import { DialogSurface, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title?: string;
  itemName: string;
  itemType?: 'video' | 'image' | 'audio' | string;
  isDeleting?: boolean;
  error?: string | null;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Delete Media Asset',
  itemName,
  itemType = 'video',
  isDeleting = false,
  error = null,
}) => {
  if (!isOpen) return null;

  const renderIcon = () => {
    switch (itemType) {
      case 'video':
        return <Film className="w-4 h-4 text-amber-400" />;
      case 'audio':
        return <Music className="w-4 h-4 text-emerald-400" />;
      case 'image':
      default:
        return <ImageIcon className="w-4 h-4 text-sky-400" />;
    }
  };

  return (
    <DialogSurface
      onClose={() => {
        if (!isDeleting) onClose();
      }}
      aria-describedby="delete-dialog-description"
      overlayClassName="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150 overflow-hidden"
    >
      {/* Close button */}
      <button
        type="button"
        disabled={isDeleting}
        onClick={onClose}
        aria-label="Close dialog"
        className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer disabled:opacity-40"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header with warning icon */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 shadow-inner">
          <Trash2 className="w-6 h-6 text-rose-400" />
        </div>
        <div className="space-y-1 pr-6">
          <DialogTitle className="text-base font-bold text-white tracking-tight">
            {title}
          </DialogTitle>
          <DialogDescription id="delete-dialog-description" className="text-xs text-zinc-400 leading-relaxed">
            Permanently delete this file from your media library and disk? This action cannot be undone.
          </DialogDescription>
        </div>
      </div>

      {/* Target Asset Preview Info Box */}
      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-xl p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700/50 flex items-center justify-center shrink-0">
          {renderIcon()}
        </div>
        <div className="truncate flex-1 min-w-0">
          <p className="text-xs font-semibold text-zinc-200 truncate" title={itemName}>
            {itemName}
          </p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
            {itemType} file
          </p>
        </div>
      </div>

      {/* Error alert if any */}
      {error && (
        <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <span className="leading-snug">{error}</span>
        </div>
      )}

      {/* Modal Actions */}
      <div className="flex items-center justify-end gap-2.5 pt-1">
        <Button
          type="button"
          variant="outline"
          disabled={isDeleting}
          onClick={onClose}
          className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border-zinc-800 cursor-pointer"
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={isDeleting}
          onClick={onConfirm}
          className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-600/25 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          <span>{isDeleting ? 'Deleting...' : 'Delete Permanently'}</span>
        </Button>
      </div>
    </DialogSurface>
  );
};
