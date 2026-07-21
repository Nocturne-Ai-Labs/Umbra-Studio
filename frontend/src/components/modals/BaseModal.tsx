'use client';

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showCloseButton?: boolean;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-7xl'
};

export function BaseModal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnEscape = true,
  closeOnBackdrop = true
}: BaseModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!closeOnEscape || !isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [closeOnEscape, isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      const focusable = contentRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (focusable?.[0] as HTMLElement)?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div data-umbra-modal-root="" className="fixed inset-0 z-[240] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        data-umbra-modal-backdrop=""
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-backdrop"
        onClick={closeOnBackdrop ? onClose : undefined}
      />

      {/* Modal */}
      <div
        ref={contentRef}
        data-umbra-modal-panel=""
        data-umbra-modal-size={size}
        className={`relative border-2 border-[var(--umbra-accent)] ${sizeClasses[size]} w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl z-10 animate-modal`}
        style={{
          background: 'rgba(0, 0, 0, 0.95)',
          backdropFilter: 'blur(20px)',
          borderRadius: '16px'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div data-umbra-modal-header="" className="flex items-center justify-between p-6 border-b border-white/10 bg-black/20">
          <h2 className="text-2xl font-black uppercase tracking-tight text-white">
            {title}
          </h2>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg glass-panel hover:bg-red-500/20 hover:text-red-400 transition-colors"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Content */}
        <div data-umbra-modal-content="" className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
