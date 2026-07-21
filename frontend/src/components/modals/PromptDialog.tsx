'use client';

import React, { useState, useRef, useEffect } from 'react';
import { BaseModal } from './BaseModal';

interface PromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (result: string | null) => void;
  title?: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
}

export function PromptDialog({
  isOpen,
  onClose: _onClose,
  onConfirm,
  title = 'Input Required',
  message = '',
  defaultValue = '',
  placeholder = '',
  confirmText = 'OK',
  cancelText = 'Cancel'
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset value when dialog opens with new defaultValue
  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
    }
  }, [isOpen, defaultValue]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      // Small delay for animation
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  const handleConfirm = (e?: React.FormEvent) => {
    e?.preventDefault();
    onConfirm(value);
  };

  const handleCancel = () => {
    onConfirm(null);
  };

  return (
    <BaseModal 
      isOpen={isOpen} 
      onClose={handleCancel} 
      title={title}
      size="sm"
    >
      <form onSubmit={handleConfirm} className="space-y-6">
        {message && (
          <p className="text-zinc-300 text-sm">
            {message}
          </p>
        )}

        <div>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-[var(--umbra-accent)] outline-none transition-colors"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-bold uppercase tracking-wider transition-all"
          >
            {cancelText}
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className="px-4 py-2 rounded-lg bg-[var(--umbra-accent)] hover:brightness-110 text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-[var(--umbra-accent-glow)] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmText}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}
