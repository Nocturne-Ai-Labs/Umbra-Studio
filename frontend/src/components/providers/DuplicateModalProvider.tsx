'use client';

import React, { useEffect, useState } from 'react';
import { DuplicateConflictModal } from '@/components/modals/DuplicateConflictModal';

interface DuplicateFile {
  name: string;
  exists: boolean;
  identical: boolean;
  size: number;
  existingSize: number;
}

interface ModalState {
  duplicates: DuplicateFile[];
  onResolve: (strategies: Record<string, 'skip' | 'replace' | 'keepBoth'>) => void;
  onCancel: () => void;
}

export function DuplicateModalProvider({ children }: { children: React.ReactNode }) {
  const [modalState, setModalState] = useState<ModalState | null>(null);

  useEffect(() => {
    const handleShowModal = (event: CustomEvent) => {
      setModalState(event.detail);
    };

    window.addEventListener('showDuplicateModal' as any, handleShowModal);
    return () => window.removeEventListener('showDuplicateModal' as any, handleShowModal);
  }, []);

  const handleResolve = (strategies: Record<string, 'skip' | 'replace' | 'keepBoth'>) => {
    if (modalState) {
      modalState.onResolve(strategies);
      setModalState(null);
    }
  };

  const handleCancel = () => {
    if (modalState) {
      modalState.onCancel();
      setModalState(null);
    }
  };

  return (
    <>
      {children}
      {modalState && (
        <DuplicateConflictModal
          duplicates={modalState.duplicates}
          onResolve={handleResolve}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
