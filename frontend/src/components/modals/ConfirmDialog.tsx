'use client';

import { BaseModal } from './BaseModal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (result: boolean) => void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'info' | 'success' | 'warning';
}

export function ConfirmDialog({
  isOpen,
  onClose: _onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger'
}: ConfirmDialogProps) {
  
  const handleConfirm = () => {
    onConfirm(true);
  };

  const handleCancel = () => {
    onConfirm(false); // Resolves promise with false
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger': return 'bg-red-500 hover:bg-red-600 shadow-red-500/20';
      case 'success': return 'bg-green-500 hover:bg-green-600 shadow-green-500/20';
      case 'warning': return 'bg-yellow-500 hover:bg-yellow-600 shadow-yellow-500/20';
      default: return 'bg-[var(--umbra-accent)] hover:brightness-110 shadow-[var(--umbra-accent-glow)]';
    }
  };

  return (
    <BaseModal 
      isOpen={isOpen} 
      onClose={handleCancel} 
      title={title}
      size="sm"
    >
      <div className="space-y-6">
        <p className="text-zinc-300 leading-relaxed text-sm">
          {message}
        </p>

        <div className="flex justify-end gap-3 pt-4">
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-bold uppercase tracking-wider transition-all"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 rounded-lg text-white text-xs font-bold uppercase tracking-wider shadow-lg transition-all active:scale-95 ${getVariantStyles()}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}
